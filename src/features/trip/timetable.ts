import { parseCsv } from "@/lib/gtfs.ts";

/**
 * 行程规划用的时刻表：把 GTFS 的 stop_times 拆成「连接」——一列车从某站开出、到达下一站的一段。
 * 按出发时刻排序后，规划器（planner.ts）从前往后扫一遍就能算出最早到达（Connection Scan Algorithm）。
 * 时刻都是「运营日 0 点起的秒数」，过了午夜的车次会超过 24 × 3600。
 */

export interface Connection {
  /** 车次（GTFS trip_id）。 */
  tripId: string;
  /**
   * 实际的一列车：跨线直通的车次在 GTFS 里拆成 …-001、…-001~2 几段，去掉 ~N 就是同一列车。
   * 规划时按它判断「还在同一列车上」，直通换线不算换乘。
   */
  vehicle: string;
  /** 线路码，例如 MT。 */
  lineCode: string;
  headsign: string;
  from: string;
  to: string;
  /** 出发站的站台号。 */
  platform?: string;
  departure: number;
  arrival: number;
}

export interface Walk {
  to: string;
  seconds: number;
}

export interface Timetable {
  /** 按出发时刻排序。 */
  connections: Connection[];
  /** 站外步行换乘（transfers.txt 里 transfer_type 2 的两站之间），以出发站索引。 */
  walks: Map<string, Walk[]>;
  /** 同站换乘至少几秒，与通用的 defaultChangeSeconds 不同的车站才有（见 changeSecondsAt）。 */
  changes: Map<string, number>;
}

/** 同站换乘至少留出的秒数（下车、换站台、上车），车站没有另外规定时用它。 */
export const defaultChangeSeconds = 120;

/**
 * 各运营方的同站换乘时间。SURcentral（SURC）是 TramTrain，车站小、站台挨着，1 分钟就换得过来。
 * GTFS 换乘表里给了某站的最短换乘时间时以那个为准。
 */
const operatorChangeSeconds: Record<string, number> = { SURC: 60 };

/** 在某站下车后换乘，至少要留几秒。 */
export function changeSecondsAt(timetable: Timetable, station: string): number {
  return timetable.changes.get(station) ?? defaultChangeSeconds;
}

/** "08:05:30" → 秒数；GTFS 允许 24 点以后的时刻。 */
function seconds(time: string | undefined): number {
  const [h = 0, m = 0, s = 0] = (time ?? "").split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

/** 站台 stop_id 形如 survival:SURC:S:PTK:1：站码 PTK，站台 1。 */
function stationAndPlatform(stopId: string): { station: string; platform?: string } {
  const [station = "", platform] = (stopId.split(":S:")[1] ?? "").split(":");
  return { station, platform };
}

export function buildTimetable(files: {
  trips: string;
  stopTimes: string;
  transfers?: string;
}): Timetable {
  const tripInfo = new Map(
    parseCsv(files.trips).map((t) => [
      t.trip_id ?? "",
      { lineCode: (t.route_id ?? "").split(":")[2] ?? "", headsign: t.trip_headsign ?? "" },
    ]),
  );

  // 每个车站属于哪个运营方（站台 stop_id 形如 survival:SURC:S:PTK:1）。
  const operatorOf = new Map<string, string>();
  const byTrip = new Map<
    string,
    { seq: number; stopId: string; arrival: number; departure: number }[]
  >();
  for (const st of parseCsv(files.stopTimes)) {
    const tripId = st.trip_id ?? "";
    const stopId = st.stop_id ?? "";
    operatorOf.set(stationAndPlatform(stopId).station, stopId.split(":")[1] ?? "");
    const list = byTrip.get(tripId) ?? [];
    list.push({
      seq: Number(st.stop_sequence),
      stopId: st.stop_id ?? "",
      arrival: seconds(st.arrival_time),
      departure: seconds(st.departure_time),
    });
    byTrip.set(tripId, list);
  }

  const connections: Connection[] = [];
  for (const [tripId, stops] of byTrip) {
    const info = tripInfo.get(tripId);
    if (!info) continue;
    stops.sort((a, b) => a.seq - b.seq);
    for (let i = 0; i + 1 < stops.length; i++) {
      const from = stationAndPlatform(stops[i]!.stopId);
      const to = stationAndPlatform(stops[i + 1]!.stopId);
      connections.push({
        tripId,
        vehicle: tripId.replace(/~\d+$/, ""),
        lineCode: info.lineCode,
        headsign: info.headsign,
        from: from.station,
        to: to.station,
        platform: from.platform,
        departure: stops[i]!.departure,
        arrival: stops[i + 1]!.arrival,
      });
    }
  }
  // 每天都开行（GTFS 只有一个每日的 service）：前一运营日开到午夜以后的车次，
  // 也就是今天凌晨的车，复制一份并减去 24 小时，凌晨查询也能找到。
  const day = 24 * 3600;
  for (const c of [...connections]) {
    if (c.departure < day) continue;
    connections.push({
      ...c,
      vehicle: `${c.vehicle}#前日`,
      departure: c.departure - day,
      arrival: c.arrival - day,
    });
  }
  connections.sort((a, b) => a.departure - b.departure);

  // 同站换乘时间：先按运营方，GTFS 换乘表里同站的一行（transfer_type 2）再覆盖。
  const changes = new Map<string, number>();
  for (const [station, operator] of operatorOf) {
    const seconds = operatorChangeSeconds[operator];
    if (seconds !== undefined) changes.set(station, seconds);
  }
  // 两个车站之间的步行换乘；直通车次的 type 4 不在这里。
  const walks = new Map<string, Walk[]>();
  for (const t of parseCsv(files.transfers ?? "")) {
    if (t.transfer_type !== "2") continue;
    const from = stationAndPlatform(t.from_stop_id ?? "").station;
    const to = stationAndPlatform(t.to_stop_id ?? "").station;
    if (!from || !to) continue;
    if (from === to) {
      if (t.min_transfer_time) changes.set(from, Number(t.min_transfer_time));
      continue;
    }
    walks.set(from, [
      ...(walks.get(from) ?? []),
      { to, seconds: Number(t.min_transfer_time) || 0 },
    ]);
  }
  return { connections, walks, changes };
}
