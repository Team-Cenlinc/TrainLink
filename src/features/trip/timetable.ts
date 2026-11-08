import { parseCsv, stopRef } from "@/lib/gtfs.ts";

/**
 * 行程规划用的时刻表：把 GTFS 的 stop_times 拆成「连接」——一列车从某站开出、到达下一站的一段。
 * 按出发时刻排序后，规划器（planner.ts）从前往后扫一遍就能算出最早到达（Connection Scan Algorithm）。
 * 时刻都是「运营日 0 点起的秒数」，过了午夜的车次会超过 24 × 3600。
 * 车站一律用车站 key「运营方:站码」（例如 SURC:PTK，见 lib/gtfs.ts 的 stationKey）：
 * 站码只在运营方内唯一，两家的 JBS 是两个车站。
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
  /** 出发站所属的运营方，例如 SURC；站台号只在运营方内唯一。 */
  operatorCode: string;
  headsign: string;
  /** 车站 key，例如 SURC:PTK。 */
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
  /** 枢纽里两家运营方之间的站内换乘（不出站）；没有时是站外步行。 */
  inStation?: boolean;
}

export interface Timetable {
  /** 按出发时刻排序。 */
  connections: Connection[];
  /** 站外步行换乘（transfers.txt 里 transfer_type 2 的两站之间）与枢纽站内换乘，以出发站索引。 */
  walks: Map<string, Walk[]>;
  /** 同站换乘至少几秒，与通用的 defaultChangeSeconds 不同的车站才有（见 changeSecondsAt）。 */
  changes: Map<string, number>;
  /**
   * GTFS 换乘表给了时间的两站之间（transfer_type 0 或 1，两个不同的车站），键为「from|to」。
   * 枢纽站内换乘有它时用它，没有时用 hubChangeSeconds。
   */
  transferSeconds: Map<string, number>;
}

/** 同站换乘至少留出的秒数（下车、换站台、上车），车站没有另外规定时用它。 */
export const defaultChangeSeconds = 120;

/**
 * 枢纽里两家运营方之间换乘至少留出的秒数：比同一家站内换乘多走一段到另一家的站台。
 * API 给了时间（GTFS 换乘表的 min_transfer_time）时以那个为准。
 */
export const hubChangeSeconds = 90;

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

  // 每个车站属于哪个运营方（车站 key 的前半）。
  const operatorOf = new Map<string, string>();
  const byTrip = new Map<
    string,
    { seq: number; stopId: string; arrival: number; departure: number }[]
  >();
  for (const st of parseCsv(files.stopTimes)) {
    const tripId = st.trip_id ?? "";
    const stopId = st.stop_id ?? "";
    const ref = stopRef(stopId);
    operatorOf.set(ref.station, ref.operatorCode);
    const list = byTrip.get(tripId) ?? [];
    list.push({
      seq: Number(st.stop_sequence),
      stopId,
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
      const from = stopRef(stops[i]!.stopId);
      const to = stopRef(stops[i + 1]!.stopId);
      connections.push({
        tripId,
        vehicle: tripId.replace(/~\d+$/, ""),
        lineCode: info.lineCode,
        operatorCode: from.operatorCode,
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
  const transferSeconds = new Map<string, number>();
  for (const t of parseCsv(files.transfers ?? "")) {
    if (t.from_trip_id || t.to_trip_id || !t.from_stop_id || !t.to_stop_id) continue;
    const from = stopRef(t.from_stop_id).station;
    const to = stopRef(t.to_stop_id).station;
    if (t.transfer_type === "2") {
      if (from === to) {
        if (t.min_transfer_time) changes.set(from, Number(t.min_transfer_time));
        continue;
      }
      walks.set(from, [
        ...(walks.get(from) ?? []),
        { to, seconds: Number(t.min_transfer_time) || 0 },
      ]);
    } else if ((t.transfer_type === "0" || t.transfer_type === "1") && from !== to) {
      if (t.min_transfer_time) transferSeconds.set(`${from}|${to}`, Number(t.min_transfer_time));
    }
  }
  return { connections, walks, changes, transferSeconds };
}

/**
 * 加上枢纽里各成员站之间的站内换乘（双向），返回新的时刻表（不改原来的）。
 * 枢纽来自 catalog 的车站组（见 lib/hubs.ts 的 hubTransfers）。换乘时间依次取：
 * 车站组给的 walkSeconds（车站信息里写的也是它）、GTFS 换乘表里这两站之间的 min_transfer_time、
 * hubChangeSeconds。
 */
export function withHubTransfers(
  timetable: Timetable,
  hubs: { stations: string[]; seconds?: number }[],
): Timetable {
  const linked = hubs.filter((hub) => hub.stations.length > 1);
  if (linked.length === 0) return timetable;
  const walks = new Map(timetable.walks);
  for (const hub of linked) {
    for (const from of hub.stations) {
      for (const to of hub.stations) {
        if (from === to) continue;
        const list = walks.get(from) ?? [];
        if (list.some((w) => w.to === to)) continue;
        const seconds =
          hub.seconds ?? timetable.transferSeconds.get(`${from}|${to}`) ?? hubChangeSeconds;
        walks.set(from, [...list, { to, seconds, inStation: true }]);
      }
    }
  }
  return { ...timetable, walks };
}
