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
}

/** 同站换乘至少留出的秒数（下车、换站台、上车）。 */
export const changeSeconds = 120;

/**
 * 依次给出几个方案：每次从上一个方案出发之后再找最早到达。
 * 新方案与上一个同时到达时，说明上一个出发得早却没有早到，换成新方案（晚出发、同时到）。
 */
export function planJourneys(timetable: Timetable, query: JourneyQuery): Journey[] {
  const count = query.count ?? 1;
  const journeys: Journey[] = [];
  let departAfter = query.departAfter;
  while (journeys.length < count) {
    const journey = earliestArrival(timetable, { ...query, departAfter });
    if (!journey) break;
    if (journeys.at(-1)?.arrival === journey.arrival) journeys.pop();
    journeys.push(journey);
    departAfter = journey.departure + 1;
  }
  return journeys;
}

type Step =
  | { kind: "ride"; enter: Connection; exit: Connection }
  | { kind: "walk"; from: string; seconds: number; arrival: number };

function earliestArrival(timetable: Timetable, query: JourneyQuery): Journey | undefined {
  const { connections, walks } = timetable;
  const earliest = new Map<string, number>([[query.from, query.departAfter]]);
  // 每站最早能上车的时刻：出发站就是出发时刻，换乘站要加上换乘时间。
  const ready = new Map<string, number>([[query.from, query.departAfter]]);
  // 每列车第一次能上车的那一段；每站最早到达时坐的是哪一段（上车段与下车段）。
  const boarded = new Map<string, Connection>();
  const reachedBy = new Map<string, Step>();

  // 到达一站后，顺带算出从这里步行能到的车站；步行时间已经包含换乘，到了就能上车。
  const walkFrom = (station: string, time: number) => {
    for (const walk of walks.get(station) ?? []) {
      const arrival = time + walk.seconds;
      if (arrival < (earliest.get(walk.to) ?? Infinity)) {
        earliest.set(walk.to, arrival);
        ready.set(walk.to, arrival);
        reachedBy.set(walk.to, { kind: "walk", from: station, seconds: walk.seconds, arrival });
      }
    }
  };
  walkFrom(query.from, query.departAfter);

  for (const c of connections) {
    if (c.departure < query.departAfter || query.cancelledTrips?.has(c.tripId)) continue;
    if (c.departure >= (earliest.get(query.to) ?? Infinity)) break;
    if (!boarded.has(c.vehicle) && (ready.get(c.from) ?? Infinity) <= c.departure) {
      boarded.set(c.vehicle, c);
    }
    const enter = boarded.get(c.vehicle);
    if (!enter) continue;
    if (c.arrival < (earliest.get(c.to) ?? Infinity)) {
      earliest.set(c.to, c.arrival);
      ready.set(c.to, c.arrival + changeSeconds);
      reachedBy.set(c.to, { kind: "ride", enter, exit: c });
      walkFrom(c.to, c.arrival);
    }
  }

  const legs: Leg[] = [];
  let station = query.to;
  while (station !== query.from) {
    const step = reachedBy.get(station);
    if (!step) return undefined;
    if (step.kind === "walk") {
      legs.unshift({
        kind: "walk",
        from: step.from,
        to: station,
        seconds: step.seconds,
        departure: step.arrival - step.seconds,
        arrival: step.arrival,
      });
      station = step.from;
    } else {
      legs.unshift(rideLeg(connections, step.enter, step.exit));
      station = step.enter.from;
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

/** 从上车段到下车段拼成一段乘车：数一数中间有几个区间，记下经过的线路。 */
function rideLeg(connections: Connection[], enter: Connection, exit: Connection): RideLeg {
  const ridden = connections.filter(
    (c) =>
      c.vehicle === enter.vehicle && c.departure >= enter.departure && c.arrival <= exit.arrival,
  );
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
