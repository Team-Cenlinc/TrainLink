import type { TripRealtime } from "@/lib/realtime.ts";
import { planJourneys, type Journey, type JourneyQuery, type Leg } from "./planner.ts";
import type { Timetable } from "./timetable.ts";

/**
 * 把实时数据套到规划好的行程上：各段乘车的预计出发、到达，整个行程的预计到达与晚点，
 * 以及换乘是否可能赶不上（按各站的最短换乘时间）。纯函数；时刻仍是「运营日 0 点起的秒数」。
 */

export interface LiveTimes {
  departure: number;
  arrival: number;
}

export type LiveLeg = Leg & { live: LiveTimes };

export interface LiveJourney extends Journey {
  legs: LiveLeg[];
  /** 预计出发与到达；没有实时数据的段按计划。 */
  live: LiveTimes;
  /** 预计到达比计划晚几分钟（不足 1 分钟为 0）。 */
  delayMinutes: number;
  /** 某次换乘预计留不出那一站的最短换乘时间。 */
  riskyChange: boolean;
}

/**
 * @param dayStart 运营日 0 点的绝对时刻（毫秒），用来把实时数据的绝对时刻换成运营日内的秒数。
 */
export function applyRealtime(
  journey: Journey,
  realtime: Map<string, TripRealtime>,
  dayStart: number,
): LiveJourney {
  const toSeconds = (epochMs: number | undefined) =>
    epochMs === undefined ? undefined : Math.round((epochMs - dayStart) / 1000);

  const legs: LiveLeg[] = journey.legs.map((leg) => {
    if (leg.kind !== "ride")
      return { ...leg, live: { departure: leg.departure, arrival: leg.arrival } };
    // 直通车的几段车次都查：出发站在第一段里，到达站可能在后一段里。
    const at = (station: string) =>
      leg.tripIds.map((id) => realtime.get(id)?.stops.get(station)).find(Boolean);
    // 某站没有预计时刻（例如已经开过）时，按整个车次的晚点推算。
    const delay = realtime.get(leg.tripId)?.delaySeconds ?? 0;
    return {
      ...leg,
      live: {
        departure:
          toSeconds(at(leg.from)?.departure ?? at(leg.from)?.arrival) ?? leg.departure + delay,
        arrival: toSeconds(at(leg.to)?.arrival ?? at(leg.to)?.departure) ?? leg.arrival + delay,
      },
    };
  });

  // 步行跟着前后的乘车走：乘车之后的步行从预计到站起走；
  // 第一段乘车之前的步行倒推到它的预计出发（「最晚几点出门」）。
  const firstRide = legs.findIndex((l) => l.kind === "ride");
  legs.forEach((leg, i) => {
    const previous = legs[i - 1];
    if (leg.kind === "walk" && i > firstRide && firstRide >= 0 && previous) {
      leg.live = {
        departure: previous.live.arrival,
        arrival: previous.live.arrival + leg.seconds,
      };
    }
  });
  for (let i = firstRide - 1; i >= 0; i--) {
    const leg = legs[i]!;
    const next = legs[i + 1]!;
    if (leg.kind !== "walk") continue;
    leg.live = { departure: next.live.departure - leg.seconds, arrival: next.live.departure };
  }

  // 每段乘车之前要能赶上：前一段是乘车要留出那一站的换乘时间；前一段是步行，走到就能上车。
  const riskyChange = legs.some((leg, i) => {
    const previous = legs[i - 1];
    if (leg.kind !== "ride" || !previous) return false;
    const readyAt =
      previous.kind === "ride"
        ? previous.live.arrival + previous.changeSeconds
        : previous.live.arrival;
    return readyAt > leg.live.departure;
  });

  const live = {
    departure: legs[0]?.live.departure ?? journey.departure,
    arrival: legs[legs.length - 1]?.live.arrival ?? journey.arrival,
  };
  return {
    ...journey,
    legs,
    live,
    delayMinutes: Math.max(0, Math.floor((live.arrival - journey.arrival) / 60)),
    riskyChange,
  };
}

type Realtime = Map<string, TripRealtime>;

/** 规划要用的实时数据：取消的车次与各车次晚点几秒。 */
function realtimeQuery(realtime: Realtime): Pick<JourneyQuery, "cancelledTrips" | "delays"> {
  const cancelledTrips = new Set<string>();
  const delays = new Map<string, number>();
  for (const [tripId, trip] of realtime) {
    if (trip.cancelled) cancelledTrips.add(tripId);
    if (trip.delaySeconds) delays.set(tripId, trip.delaySeconds);
  }
  return { cancelledTrips, delays };
}

/**
 * 接下来的几个方案，套上实时数据：取消的车次不用；晚点、按时刻表已经开出但实际还没开的车照样列出；
 * 预计出发已经过了 departAfter 的去掉（整车晚点与各站预计时刻对不上时）。
 * @param dayStart 运营日 0 点的绝对时刻（毫秒）。
 */
export function liveJourneys(
  timetable: Timetable,
  query: Pick<JourneyQuery, "from" | "to" | "departAfter" | "count">,
  realtime: Realtime,
  dayStart: number,
): LiveJourney[] {
  const count = query.count ?? 1;
  // 多找两个，去掉已经开走的之后仍够数。
  return planJourneys(timetable, { ...query, count: count + 2, ...realtimeQuery(realtime) })
    .map((journey) => applyRealtime(journey, realtime, dayStart))
    .filter((journey) => journey.live.departure >= query.departAfter)
    .slice(0, count);
}

/**
 * 找回选中的那个方案（乘坐指南）：按时刻表的出发时刻与第一段乘车的车次对上才算，
 * 不拿别的车顶替。选中的车取消了时 cancelled 为 true。已经开出的方案也照样找得到。
 */
export function findJourney(
  timetable: Timetable,
  selected: { from: string; to: string; departure: number; tripId?: string },
  realtime: Realtime,
  dayStart: number,
): { journey: LiveJourney | undefined; cancelled: boolean } {
  if (selected.tripId && realtime.get(selected.tripId)?.cancelled) {
    return { journey: undefined, cancelled: true };
  }
  const firstTrip = (journey: Journey) => journey.legs.find((l) => l.kind === "ride")?.tripId;
  const journey = planJourneys(timetable, {
    from: selected.from,
    to: selected.to,
    departAfter: selected.departure,
    // 同一时刻起找几个：晚点的车可能排在前面。第一段只坐选中的那班（被后面快车追上也找得回来）。
    count: 3,
    firstTripId: selected.tripId,
    ...realtimeQuery(realtime),
  }).find((j) => j.departure === selected.departure && firstTrip(j) === selected.tripId);
  return {
    journey: journey && applyRealtime(journey, realtime, dayStart),
    cancelled: false,
  };
}
