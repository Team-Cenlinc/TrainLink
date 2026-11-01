import type { TripRealtime } from "@/lib/realtime.ts";
import type { LiveJourney, LiveLeg } from "./live.ts";
import type { Timetable } from "./timetable.ts";

/**
 * 乘车 GO：跟着一趟行程走，算出此刻走到哪一步了。纯函数，时刻都是「运营日 0 点起的秒数」。
 * 列车位置来自实时数据：一个车次的实时数据只列出还没经过的站，不在里面的站就是已经经过了；
 * 没有实时数据时按（预计）时刻推算。
 */

/** 一段乘车经过的一站（不含上车站）。 */
export interface RideStop {
  station: string;
  /** 预计到站；没有实时数据时是计划时刻。 */
  time: number;
  /** 列车已经过了这一站。 */
  passed: boolean;
}

/** 一段乘车经过的一站的计划：在哪个车次里（直通车各站分在几个车次里）、计划几点到。 */
export interface PlannedStop {
  station: string;
  tripId: string;
  arrival: number;
}

/**
 * 一段乘车经过的各站（不含上车站），按站序，计划时刻。只跟方案有关，跟着方案算一次就行，
 * 不必随时间重算（要扫一遍整张时刻表）。步行段是空数组。
 */
export function plannedStops(timetable: Timetable, leg: LiveLeg): PlannedStop[] {
  if (leg.kind !== "ride") return [];
  const trips = new Set(leg.tripIds);
  return timetable.connections
    .filter((c) => trips.has(c.tripId) && c.departure >= leg.departure && c.arrival <= leg.arrival)
    .sort((a, b) => a.departure - b.departure)
    .map((c) => ({ station: c.to, tripId: c.tripId, arrival: c.arrival }));
}

/**
 * 套上实时数据：各站预计到站时刻与是否已经过了。
 * 列车位置：一个车次的实时数据从当前（或刚离开）的站列起，所以排在它列出的第一站之前的站已经过了；
 * 列表可能只到接下来几站，后面没列出的站不能当成经过了，按时刻判断。
 * @param dayStart 运营日 0 点的绝对时刻（毫秒）
 * @param now 现在（运营日内的秒数）
 */
export function liveStops(
  planned: PlannedStop[],
  realtime: Map<string, TripRealtime>,
  dayStart: number,
  now: number,
): RideStop[] {
  // 实时数据还列着的、排得最前的一站：它之前的站都过了。
  const firstListed = planned.findIndex((s) => realtime.get(s.tripId)?.stops.has(s.station));
  return planned.map((s, i) => {
    const rt = realtime.get(s.tripId);
    const predicted = rt?.stops.get(s.station);
    const epoch = predicted?.arrival ?? predicted?.departure;
    const time =
      epoch !== undefined
        ? Math.round((epoch - dayStart) / 1000)
        : s.arrival + (rt?.delaySeconds ?? 0);
    return { station: s.station, time, passed: i < firstListed || time <= now };
  });
}

/** plannedStops 与 liveStops 合在一起（测试与一次性计算用）。 */
export function legStops(
  timetable: Timetable,
  leg: LiveLeg,
  realtime: Map<string, TripRealtime>,
  dayStart: number,
  now: number,
): RideStop[] {
  return liveStops(plannedStops(timetable, leg), realtime, dayStart, now);
}

export type RideStatus = (
  | { kind: "wait"; legIndex: number; departsIn: number }
  | { kind: "walk"; legIndex: number; startsIn: number; arrivesIn: number }
  | { kind: "ride"; legIndex: number; stopsLeft: number; nextStop: string; arrivesIn: number }
  | { kind: "arrived" }
) & {
  /** 整趟走了多少，0 到 1（按预计出发、到达的时刻）。 */
  progress: number;
};

/**
 * 此刻在哪一步：等车（上车站或换乘站）、步行、在车上（还有几站）、已到达。
 * @param stops 各段经过的站（legStops），步行段是空数组
 * @param now 现在（运营日内的秒数）
 */
export function rideStatus(journey: LiveJourney, stops: RideStop[][], now: number): RideStatus {
  const { departure, arrival } = journey.live;
  const progress = Math.min(1, Math.max(0, (now - departure) / Math.max(1, arrival - departure)));
  const left = (t: number) => Math.max(0, t - now);
  for (const [legIndex, leg] of journey.legs.entries()) {
    if (leg.kind === "walk") {
      if (now < leg.live.arrival) {
        return {
          kind: "walk",
          legIndex,
          startsIn: left(leg.live.departure),
          arrivesIn: left(leg.live.arrival),
          progress,
        };
      }
      continue;
    }
    const remaining = (stops[legIndex] ?? []).filter((s) => !s.passed);
    const started = (stops[legIndex] ?? []).some((s) => s.passed);
    if (!started && now < leg.live.departure) {
      return { kind: "wait", legIndex, departsIn: left(leg.live.departure), progress };
    }
    const next = remaining[0];
    if (next) {
      return {
        kind: "ride",
        legIndex,
        stopsLeft: remaining.length,
        nextStop: next.station,
        arrivesIn: left(remaining[remaining.length - 1]!.time),
        progress,
      };
    }
  }
  return { kind: "arrived", progress };
}

/**
 * 下车提醒的时刻：前一站开出时（下一站就下车）；只坐一站时开车就提醒。
 * 前一站的开出按到站时刻算（站停很短）。
 */
export function alightReminderAt(stops: RideStop[], leg: LiveLeg): number {
  return stops[stops.length - 2]?.time ?? leg.live.departure;
}

const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));

/** 一段乘车怎么认车：线路码与终点方向。 */
const trainOf = (leg: LiveLeg) => (leg.kind === "ride" ? `${leg.lineCode} 往 ${leg.headsign}` : "");

/**
 * GO 页面的大字提示（title）与下面一行说明（detail）。
 * @param name 站码 → 站名
 */
export function rideText(
  status: RideStatus,
  journey: LiveJourney,
  name: (code: string) => string,
): { title: string; detail: string } {
  const legs = journey.legs;
  if (status.kind === "arrived") {
    const last = legs[legs.length - 1];
    return { title: `已到达 ${last ? name(last.to) : ""}`, detail: "这趟乘车结束了" };
  }
  const leg = legs[status.legIndex]!;
  if (status.kind === "walk") {
    return {
      title: `步行到 ${name(leg.to)}`,
      detail:
        status.startsIn > 0
          ? `${minutes(status.startsIn)} 分后出发 · 约 ${minutes(status.arrivesIn - status.startsIn)} 分钟`
          : `约 ${minutes(status.arrivesIn)} 分钟走到`,
    };
  }
  if (status.kind === "wait") {
    const platform = leg.kind === "ride" && leg.platform ? `${leg.platform} 号站台` : "";
    const previous = legs[status.legIndex - 1];
    const when = status.departsIn < 60 ? "即将开车" : `${minutes(status.departsIn)} 分后开车`;
    return {
      title:
        previous?.kind === "ride"
          ? `${name(leg.from)} 换乘${platform ? ` · ${platform}` : ""}`
          : `${platform || `${name(leg.from)} `}上车`,
      detail: `${trainOf(leg)} · ${when}`,
    };
  }
  // 车上。
  if (status.stopsLeft > 1) {
    return {
      title: `还有 ${status.stopsLeft} 站 · ${minutes(status.arrivesIn)} 分`,
      detail: `下一站 ${name(status.nextStop)} · 在 ${name(leg.to)} 下车`,
    };
  }
  const after = legs[status.legIndex + 1];
  return {
    title: `下一站 ${name(leg.to)} 下车`,
    detail: !after
      ? "就是终点"
      : after.kind === "walk"
        ? `下车后步行到 ${name(after.to)}`
        : `换乘 ${trainOf(after)}${after.platform ? ` · ${after.platform} 号站台` : ""}`,
  };
}
