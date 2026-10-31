import type { Connection, Timetable } from "./timetable.ts";

/**
 * 行程规划：Connection Scan Algorithm。连接按出发时刻排好，从出发时刻起扫一遍，
 * 记下每站的最早到达和「坐哪一班到的」，扫到终点后倒推出乘车段。纯函数，不涉及 React。
 */

export interface RideLeg {
  kind: "ride";
  tripId: string;
  /** 这段乘车经过的车次，按顺序；跨线直通时是同一列车的几段（…-001、…-001~2）。 */
  tripIds: string[];
  /** 上车时的线路。 */
  lineCode: string;
  /** 这段乘车经过的线路，按顺序；跨线直通时不止一条。 */
  lineCodes: string[];
  headsign: string;
  from: string;
  to: string;
  /** 上车站台。 */
  platform?: string;
  departure: number;
  arrival: number;
  /** 乘几站（经过的区间数）。 */
  stops: number;
}

/** 站外换乘：从一个车站步行到另一个车站。 */
export interface WalkLeg {
  kind: "walk";
  from: string;
  to: string;
  seconds: number;
  departure: number;
  arrival: number;
}

export type Leg = RideLeg | WalkLeg;

export interface Journey {
  departure: number;
  arrival: number;
  legs: Leg[];
}

export interface JourneyQuery {
  from: string;
  to: string;
  /** 运营日 0 点起的秒数。 */
  departAfter: number;
  /** 最多给出几个方案（默认 1）。 */
  count?: number;
  /** 实时数据里已取消的车次（trip_id），规划时跳过。 */
  cancelledTrips?: Set<string>;
  /**
   * 实时数据里各车次晚点几秒（trip_id → 秒）。按预计出发判断车开走没有：
   * 按时刻表已经开出、实际晚点还没开的车照样能坐。
   */
  delays?: Map<string, number>;
}

/** 同站换乘至少留出的秒数（下车、换站台、上车）。 */
export const changeSeconds = 120;

/** 晚点的车最多往回找多久（时刻表上已经开出、实际还没开的车）。 */
const maxLookBackSeconds = 3600;

/**
 * 依次给出几个方案：每次从上一个方案出发之后再找最早到达。
 * 新方案与上一个同时到达时，说明上一个出发得早却没有早到，换成新方案（晚出发、同时到）。
 * 起终点之间能直接步行时，步行方案随时可走，只列一次；之后只找乘车方案，比步行还慢就不再往下找。
 */
export function planJourneys(timetable: Timetable, query: JourneyQuery): Journey[] {
  const count = query.count ?? 1;
  const delayOf = (tripId: string) => Math.max(0, query.delays?.get(tripId) ?? 0);
  let lookBack = 0;
  for (const delay of query.delays?.values() ?? []) lookBack = Math.max(lookBack, delay);
  const journeys: Journey[] = [];
  // 从「现在」往前推最大晚点开始找，晚点还没开的车也能找到；按时刻表已经开出的车在搜索里跳过。
  let departAfter = query.departAfter - Math.min(lookBack, maxLookBackSeconds);
  /** 已经列过的步行方案要走几秒；之后的搜索不再考虑直接步行。 */
  let walkSeconds: number | undefined;
  // 每次搜索至少往后推 1 秒，有限次就会结束；上限防止被比步行还慢的车拖住。
  for (let searches = 0; journeys.length < count && searches < count * 3; searches++) {
    const journey = earliestArrival(
      timetable,
      query,
      delayOf,
      departAfter,
      walkSeconds !== undefined,
    );
    if (!journey) break;
    departAfter = journey.departure + 1;
    if (!journey.legs.some((l) => l.kind === "ride")) {
      walkSeconds = journey.arrival - journey.departure;
    } else if (walkSeconds !== undefined && journey.arrival >= journey.departure + walkSeconds) {
      break;
    }
    if (journeys.at(-1)?.arrival === journey.arrival) journeys.pop();
    journeys.push(journey);
  }
  // 晚点的车按时刻表出发得早，排序按预计出发。
  const liveDeparture = (journey: Journey) => {
    const firstRide = journey.legs.find((l) => l.kind === "ride");
    return journey.departure + (firstRide ? delayOf(firstRide.tripId) : 0);
  };
  return journeys.sort((a, b) => liveDeparture(a) - liveDeparture(b));
}

/**
 * 怎样到的某一站：坐哪一段车（上车段与下车段），或从哪一站步行过来；
 * prev 是上一步，一路往回接到出发站（出发站没有上一步）。
 */
type Step =
  | { kind: "ride"; enter: Connection; exit: Connection; prev?: Step }
  | { kind: "walk"; from: string; to: string; seconds: number; arrival: number; prev?: Step };

/**
 * @param delayOf 车次晚点几秒（不早于时刻表）。
 * @param scanFrom 这次搜索看时刻表上几点以后出发的车（重新搜索时是上一个方案出发之后；
 *   第一次搜索往前推了最大晚点）。人最早 query.departAfter 才出发，车按预计出发判断开走没有。
 * @param ridesOnly 不考虑从起点直接步行到终点（步行方案已经列过）。
 */
function earliestArrival(
  timetable: Timetable,
  query: JourneyQuery,
  delayOf: (tripId: string) => number,
  scanFrom: number,
  ridesOnly: boolean,
): Journey | undefined {
  const { connections, walks } = timetable;
  const departAfter = Math.max(scanFrom, query.departAfter);
  // 每站最早到达的时刻与怎样到的（终点用它倒推行程）。
  const earliest = new Map<string, number>([[query.from, departAfter]]);
  const arrivedBy = new Map<string, Step>();
  // 每站最早能上车的时刻与怎样到的：出发站就是出发时刻；坐车到站要加上换乘时间，
  // 步行到站不用（步行时间已经包含换乘）。所以步行可能比坐车晚到、却能更早上车，两者分开记。
  const ready = new Map<string, number>([[query.from, departAfter]]);
  const readyBy = new Map<string, Step>();
  // 每列车第一次能上车的那一段，以及上车前是怎样到的那一站。
  const boarded = new Map<string, { enter: Connection; prev?: Step }>();

  const reach = (station: string, arrival: number, readyAt: number, step: Step) => {
    if (arrival < (earliest.get(station) ?? Infinity)) {
      earliest.set(station, arrival);
      arrivedBy.set(station, step);
    }
    if (readyAt < (ready.get(station) ?? Infinity)) {
      ready.set(station, readyAt);
      readyBy.set(station, step);
    }
  };
  // 到达一站后，顺带算出从这里步行能到的车站；步行时间已经包含换乘，到了就能上车。
  const walkFrom = (station: string, time: number, prev: Step | undefined) => {
    for (const walk of walks.get(station) ?? []) {
      if (ridesOnly && station === query.from && walk.to === query.to) continue;
      const arrival = time + walk.seconds;
      reach(walk.to, arrival, arrival, {
        kind: "walk",
        from: station,
        to: walk.to,
        seconds: walk.seconds,
        arrival,
        prev,
      });
    }
  };
  walkFrom(query.from, departAfter, undefined);

  for (let i = firstDepartingAt(connections, scanFrom); i < connections.length; i++) {
    const c = connections[i]!;
    if (c.departure >= (earliest.get(query.to) ?? Infinity)) break;
    if (query.cancelledTrips?.has(c.tripId)) continue;
    if (!boarded.has(c.vehicle)) {
      // 按预计出发判断：已经开走的车坐不上，晚点的车等得到。
      const departs = c.departure + delayOf(c.tripId);
      if (departs >= query.departAfter && (ready.get(c.from) ?? Infinity) <= departs) {
        boarded.set(c.vehicle, { enter: c, prev: readyBy.get(c.from) });
      }
    }
    const ride = boarded.get(c.vehicle);
    if (!ride) continue;
    const improves = c.arrival < (earliest.get(c.to) ?? Infinity);
    if (!improves && c.arrival + changeSeconds >= (ready.get(c.to) ?? Infinity)) continue;
    const step: Step = { kind: "ride", enter: ride.enter, exit: c, prev: ride.prev };
    reach(c.to, c.arrival, c.arrival + changeSeconds, step);
    // 晚到的车站步行出去也只会更晚，只在最早到达变早时才算步行。
    if (improves) walkFrom(c.to, c.arrival, step);
  }

  const legs: Leg[] = [];
  for (let step = arrivedBy.get(query.to); step; step = step.prev) {
    if (step.kind === "walk") {
      legs.unshift({
        kind: "walk",
        from: step.from,
        to: step.to,
        seconds: step.seconds,
        departure: step.arrival - step.seconds,
        arrival: step.arrival,
      });
    } else {
      legs.unshift(rideLeg(connections, step.enter, step.exit));
    }
  }
  // 开头的步行往后挪，正好赶上第一段乘车：出发时刻是「最晚几点出门」，而不是查询时刻。
  const firstRide = legs.findIndex((l) => l.kind === "ride");
  let leaveBy = legs[firstRide]?.departure;
  for (let i = firstRide - 1; i >= 0 && leaveBy !== undefined; i--) {
    const walk = legs[i]!;
    legs[i] = { ...walk, departure: leaveBy - (walk.arrival - walk.departure), arrival: leaveBy };
    leaveBy = legs[i]!.departure;
  }
  const first = legs[0];
  const last = legs[legs.length - 1];
  return first && last ? { departure: first.departure, arrival: last.arrival, legs } : undefined;
}

/** 第一个在 time 或之后出发的连接的下标（连接按出发时刻排好，二分查找）。 */
function firstDepartingAt(connections: Connection[], time: number): number {
  let low = 0;
  let high = connections.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (connections[mid]!.departure < time) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** 从上车段到下车段拼成一段乘车：数一数中间有几个区间，记下经过的线路。 */
function rideLeg(connections: Connection[], enter: Connection, exit: Connection): RideLeg {
  // 这列车在两段之间的区间，出发时刻都在上车与下车之间，只看这一小段连接。
  const ridden: Connection[] = [];
  for (let i = firstDepartingAt(connections, enter.departure); i < connections.length; i++) {
    const c = connections[i]!;
    if (c.departure > exit.departure) break;
    if (c.vehicle === enter.vehicle && c.arrival <= exit.arrival) ridden.push(c);
  }
  return {
    kind: "ride",
    tripId: enter.tripId,
    tripIds: [...new Set(ridden.map((c) => c.tripId))],
    lineCode: enter.lineCode,
    lineCodes: [...new Set(ridden.map((c) => c.lineCode))],
    headsign: enter.headsign,
    from: enter.from,
    to: exit.to,
    platform: enter.platform,
    departure: enter.departure,
    arrival: exit.arrival,
    stops: ridden.length,
  };
}
