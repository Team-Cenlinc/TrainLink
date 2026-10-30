import { unzipSync, strFromU8 } from "fflate";
import { railApiBase } from "./railApi.ts";

/**
 * 从 GTFS 静态包推出每条线路的站序。catalog 没有站序，GTFS 的 stop_times 有。
 * 整个包约 170 KB，API 缓存 5 分钟；这里只读 trips、stops、stop_times 三个文件。
 */

/** 键为「运营商:线路」（例如 SURC:MT），值为按站序排列的站码（例如 PTK）。 */
export type LineOrders = Map<string, string[]>;

export function lineKey(operatorCode: string, lineCode: string): string {
  return `${operatorCode}:${lineCode}`;
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
 * 每条线路取停站最多的一个车次作为全线站序。
 * 交路有长有短，最长的那一班覆盖全线；两个方向的站序相反，这里不区分方向。
 */
export function buildLineOrders(files: {
  trips: string;
  stops: string;
  stopTimes: string;
}): LineOrders {
  const routeOfTrip = new Map(
    parseCsv(files.trips).map((t) => [t.trip_id ?? "", t.route_id ?? ""] as const),
  );
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

  const longest = new Map<string, string[]>();
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
    if (codes.length > (longest.get(key)?.length ?? 0)) longest.set(key, codes);
  }
  return longest;
}

/** 下载并解析某个服务器的 GTFS 静态包。 */
export async function fetchLineOrders(serverId: string, signal?: AbortSignal): Promise<LineOrders> {
  const response = await fetch(
    `${railApiBase}/v1/rail/servers/${encodeURIComponent(serverId)}/gtfs.zip`,
    { signal },
  );
  if (!response.ok) throw new Error(`GTFS 下载失败：${response.status}`);
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()), {
    filter: (file) => ["trips.txt", "stops.txt", "stop_times.txt"].includes(file.name),
  });
  const read = (name: string) => {
    const file = files[name];
    if (!file) throw new Error(`GTFS 包缺少 ${name}`);
    return strFromU8(file);
  };
  return buildLineOrders({
    trips: read("trips.txt"),
    stops: read("stops.txt"),
    stopTimes: read("stop_times.txt"),
  });
}
