import { unzipSync, strFromU8 } from "fflate";
import { linePatterns } from "./lineShape.ts";
import { railApiBase } from "./railApi.ts";

/**
 * 从 GTFS 静态包推出每条线路的站序与交路终点。catalog 没有站序，GTFS 的 stop_times 有。
 * 整个包约 170 KB，API 缓存 5 分钟；这里只读 trips、stops、stop_times 三个文件。
 */

/**
 * 键为「运营商:线路」（例如 SURC:MT），值为这条线的几种停站方式（站码序列，见 lineShape.ts 的 linePatterns）。
 * 没有支线的线路只有一种；有支线时用 lineShape 拼成主干与支线。
 */
export type LinePatterns = Map<string, string[][]>;

/** 从 GTFS 推出的索引：线路的停站方式，以及每个交路的终点（trip_headsign）。 */
export interface GtfsIndex {
  linePatterns: LinePatterns;
  /** 键为交路代码（与在线列车的 routeCode 相同，例如 SURC:MT:MT-2F_Short），值为终点站名。 */
  headsigns: Map<string, string>;
  /** 键同上，值为这个交路按站序经过的站码（取该交路的一个车次，跨线直通时含两条线）。 */
  routeStops: Map<string, string[]>;
  /**
   * 与 routeStops 一一对应：列车从这一站开出时所在的线路码。
   * 跨线直通时会变，例如 MT-3O_DPExp 在新笛矢·壑湖之前是 MT，之后是 WS。
   */
  routeStopLines: Map<string, string[]>;
}

export function lineKey(operatorCode: string, lineCode: string): string {
  return `${operatorCode}:${lineCode}`;
}

/**
 * 车站 key「运营方:站码」（例如 SURC:PTK），同一服务器内唯一。站码只在运营方内唯一：
 * PUAT 与 SURC 都有 JBS、PPK，规划、乘车与实时数据都按 key 区分车站。
 */
export function stationKey(operatorCode: string, stationCode: string): string {
  return `${operatorCode}:${stationCode}`;
}

/**
 * 拆开车站 key。不带「:」的是旧数据里只存了站码的车站（例如旧车票的闸机记录），
 * 用 fallbackOperator 补上运营方。
 */
export function parseStationKey(
  key: string,
  fallbackOperator = "",
): { operatorCode: string; stationCode: string } {
  const at = key.indexOf(":");
  return at < 0
    ? { operatorCode: fallbackOperator, stationCode: key }
    : { operatorCode: key.slice(0, at), stationCode: key.slice(at + 1) };
}

/** GTFS 站台或车站的 stop_id（survival:SURC:S:PTK:1、survival:SURC:S:PTK）：车站 key 与站台号。 */
export function stopRef(stopId: string): {
  station: string;
  operatorCode: string;
  stationCode: string;
  platform?: string;
} {
  const operatorCode = stopId.split(":")[1] ?? "";
  const [stationCode = "", platform] = (stopId.split(":S:")[1] ?? "").split(":");
  return { station: stationKey(operatorCode, stationCode), operatorCode, stationCode, platform };
}

/**
 * 最小的 CSV 解析：支持带引号的字段与字段内的逗号、换行。
 * GTFS 文件第一行是表头，返回以表头为键的对象数组。
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header = [], ...body] = rows;
  return body
    .filter((r) => r.length > 1 || r[0])
    .map((r) => Object.fromEntries(header.map((name, i) => [name.replace(/^﻿/, ""), r[i] ?? ""])));
}

/** GTFS 站点 ID 形如 survival:SURC:S:PTK:1（站台）或 survival:SURC:S:PTK（车站），取出站码。 */
function stationCodeOf(stopId: string, parentOf: Map<string, string>): string | undefined {
  const stationId = parentOf.get(stopId) || stopId;
  return stationId.split(":S:")[1]?.split(":")[0];
}

/**
 * 线路站序：每条线路取停站最多的一个车次作为全线站序。
 * 交路有长有短，最长的那一班覆盖全线；两个方向的站序相反，这里不区分方向。
 * 交路终点：trip_short_name 形如 MT-2F_Short-001，去掉末尾班次号就是交路名，
 * 与 trip_id 里的「运营商:线路」拼起来即在线列车的 routeCode。
 *
 * 跨线直通的车次在 GTFS 里按线路拆成几段：trip_id 依次为 …-001、…-001~2，
 * 各段 route_id 不同，但 trip_id 里的线路都是交路所属线路；相邻两段在换乘站首尾重叠。
 */
export function buildGtfsIndex(files: {
  trips: string;
  stops: string;
  stopTimes: string;
}): GtfsIndex {
  const trips = parseCsv(files.trips);
  const routeOfTrip = new Map(trips.map((t) => [t.trip_id ?? "", t.route_id ?? ""] as const));
  const headsigns = new Map<string, string>();
  // 每个交路取一个车次，记下它的各段 trip_id（按 ~2、~3 的段号排序），之后拼成整条站序。
  const legsOfPattern = new Map<string, { base: string; legs: string[] }>();
  for (const trip of trips) {
    const tripId = trip.trip_id ?? "";
    // trip_id 形如 survival:SURC:MT:SURC_Temporary:MT-3O_DPExp-001~2。
    const [, operatorCode, lineCode] = tripId.split(":");
    const pattern = trip.trip_short_name?.replace(/-\d+$/, "");
    if (!operatorCode || !lineCode || !pattern) continue;
    const key = `${operatorCode}:${lineCode}:${pattern}`;
    if (trip.trip_headsign) headsigns.set(key, trip.trip_headsign);
    const base = tripId.replace(/~\d+$/, "");
    const entry = legsOfPattern.get(key) ?? { base, legs: [] };
    if (entry.base === base) entry.legs.push(tripId);
    legsOfPattern.set(key, entry);
  }
  const parentOf = new Map(
    parseCsv(files.stops).map((s) => [s.stop_id ?? "", s.parent_station ?? ""] as const),
  );
  const stopsOfTrip = new Map<string, { seq: number; stopId: string }[]>();
  for (const st of parseCsv(files.stopTimes)) {
    const tripId = st.trip_id ?? "";
    const list = stopsOfTrip.get(tripId) ?? [];
    list.push({ seq: Number(st.stop_sequence), stopId: st.stop_id ?? "" });
    stopsOfTrip.set(tripId, list);
  }

  const codesOfTrip = new Map<string, string[]>();
  const tripsOfLine = new Map<string, string[][]>();
  for (const [tripId, stops] of stopsOfTrip) {
    const routeId = routeOfTrip.get(tripId);
    if (!routeId) continue;
    // route_id 形如 survival:SURC:MT，取后两段作为线路键。
    const [, operatorCode, lineCode] = routeId.split(":");
    if (!operatorCode || !lineCode) continue;
    const key = lineKey(operatorCode, lineCode);
    const codes = stops
      .sort((a, b) => a.seq - b.seq)
      .map((s) => stationCodeOf(s.stopId, parentOf))
      .filter((code): code is string => Boolean(code));
    codesOfTrip.set(tripId, codes);
    const trips = tripsOfLine.get(key) ?? [];
    trips.push(codes);
    tripsOfLine.set(key, trips);
  }

  const legNumber = (tripId: string) => Number(tripId.match(/~(\d+)$/)?.[1] ?? 1);
  const routeStops = new Map<string, string[]>();
  const routeStopLines = new Map<string, string[]>();
  for (const [key, { legs }] of legsOfPattern) {
    const codes: string[] = [];
    const lines: string[] = [];
    for (const leg of legs.sort((a, b) => legNumber(a) - legNumber(b))) {
      // 每一段的线路看它的 route_id（survival:SURC:WS → WS）。
      const lineCode = routeOfTrip.get(leg)?.split(":")[2] ?? "";
      for (const code of codesOfTrip.get(leg) ?? []) {
        if (codes.at(-1) === code) {
          // 换乘站同时是上一段的终点和下一段的起点：只留一次，开出时已在下一段的线路上。
          lines[lines.length - 1] = lineCode;
        } else {
          codes.push(code);
          lines.push(lineCode);
        }
      }
    }
    if (codes.length) {
      routeStops.set(key, codes);
      routeStopLines.set(key, lines);
    }
  }
  const patterns: LinePatterns = new Map(
    [...tripsOfLine].map(([key, trips]) => [key, linePatterns(trips)] as const),
  );
  return { linePatterns: patterns, headsigns, routeStops, routeStopLines };
}

/**
 * 下载某服务器的 GTFS 包，解压出需要的几个文件（文本）。
 * GTFS 索引与行程规划的时刻表各自调用一次，各发一次请求。包的 Cache-Control 是 max-age=299，
 * 浏览器缓存还新鲜时第二次可以直接命中，但不保证：两边同时读取、或 CDN 上的副本已经存了一阵
 * （Age 头）时，仍会再下载一遍。
 */
export async function fetchGtfsFiles<Name extends string>(
  serverId: string,
  names: Name[],
  signal?: AbortSignal,
): Promise<Record<Name, string>> {
  const response = await fetch(
    `${railApiBase}/v1/rail/servers/${encodeURIComponent(serverId)}/gtfs.zip`,
    { signal },
  );
  if (!response.ok) throw new Error(`GTFS 下载失败：${response.status}`);
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()), {
    filter: (file) => (names as string[]).includes(file.name),
  });
  const read = (name: string) => {
    const file = files[name];
    if (!file) throw new Error(`GTFS 包缺少 ${name}`);
    return strFromU8(file);
  };
  return Object.fromEntries(names.map((name) => [name, read(name)])) as Record<Name, string>;
}

/** 下载并解析某个服务器的 GTFS 静态包，生成 GTFS 索引。 */
export async function fetchGtfsIndex(serverId: string, signal?: AbortSignal): Promise<GtfsIndex> {
  const files = await fetchGtfsFiles(
    serverId,
    ["trips.txt", "stops.txt", "stop_times.txt"],
    signal,
  );
  return buildGtfsIndex({
    trips: files["trips.txt"],
    stops: files["stops.txt"],
    stopTimes: files["stop_times.txt"],
  });
}
