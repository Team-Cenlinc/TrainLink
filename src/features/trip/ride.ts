import type { TripRealtime } from "@/lib/realtime.ts";
import type { LiveJourney, LiveLeg } from "./live.ts";
import { clockOf } from "./serviceDay.ts";
import type { Timetable } from "./timetable.ts";

/**
 * 乘车 GO：跟着一趟行程走，算出此刻走到哪一步了。纯函数，时刻都是「运营日 0 点起的秒数」。
 * 列车位置来自实时数据：一个车次的实时数据只列出还没经过的站，不在里面的站就是已经经过了；
 * 没有实时数据时按（预计）时刻推算。
 */

/** 一段乘车的一站：第一个是上车站，最后一个是下车站。 */
export interface RideStop {
  station: string;
  /** 预计到站；没有实时数据时是计划时刻。上车站是列车进站的时刻（始发站同开车时刻）。 */
  arrival: number;
  /** 预计开车。下车站同到站时刻：到了就下车，不管列车还停多久。 */
  departure: number;
  /** 列车已经开出这一站（下车站：已经到了）。 */
  passed: boolean;
  /** 列车正停在这一站：到了，还没开。 */
  dwelling: boolean;
}

/** 一段乘车一站的计划：在哪个车次里（直通车各站分在几个车次里）、计划几点到、几点开。 */
export interface PlannedStop {
  station: string;
  tripId: string;
  arrival: number;
  departure: number;
}

/**
 * 一段乘车的各站（上车站、经过的站、下车站），按站序，计划时刻。只跟方案有关，跟着方案算一次就行，
 * 不必随时间重算（要扫一遍整张时刻表）。步行段是空数组。
 */
export function plannedStops(timetable: Timetable, leg: LiveLeg): PlannedStop[] {
  if (leg.kind !== "ride") return [];
  const trips = new Set(leg.tripIds);
  const rides = timetable.connections
    .filter((c) => trips.has(c.tripId) && c.departure >= leg.departure && c.arrival <= leg.arrival)
    .sort((a, b) => a.departure - b.departure);
  const first = rides[0];
  if (!first) return [];
  // 列车开进上车站的那一段（始发站没有）：停站从这时开始。按同一列车找（在直通的交接站上车时，
  // 列车是以前一段车次进站的）；环线会多次经过同一站，取开车前最近的一次。
  const into = timetable.connections
    .filter((c) => c.vehicle === first.vehicle && c.to === leg.from && c.arrival <= first.departure)
    .reduce<(typeof rides)[number] | undefined>(
      (latest, c) => (!latest || c.arrival > latest.arrival ? c : latest),
      undefined,
    );
  return [
    {
      station: leg.from,
      tripId: first.tripId,
      arrival: into?.arrival ?? first.departure,
      departure: first.departure,
    },
    // 经过的站在下一段开出时离开；下车站到了就算。
    ...rides.map((c, i) => ({
      station: c.to,
      tripId: c.tripId,
      arrival: c.arrival,
      departure: rides[i + 1]?.departure ?? c.arrival,
    })),
  ];
}

/** 列车停在站上时，这一趟预计到这一站最多还差多少秒（早到）；差得更多就是别的车次停在这里。 */
const earlyArrival = 120;

/** 列车此刻的位置（来自在线列车）：停在哪个车站上；开着或停在区间里时没有 stoppedAt。 */
export interface TrainPosition {
  stoppedAt?: string;
}

/**
 * 套上实时数据：各站预计到站、开车时刻，列车开过了没有、是不是正停着。
 * 列车位置：一个车次的实时数据从当前（或刚离开）的站列起，所以排在它列出的第一站之前的站已经过了；
 * 列表可能只到接下来几站，后面没列出的站不能当成经过了，按时刻判断。
 * 停站：有在线列车的位置时按位置（停在这一站上，同列车详情），晚开、早到都对；
 * 没有位置但有实时数据时，只有它列出的第一站（当前站）才可能是停着的——刚开过的站还列着时，
 * 列车还在去下一站的路上，不能因为预计到站时刻过了就当成到了；都没有时按时刻推算。
 * @param dayStart 运营日 0 点的绝对时刻（毫秒）
 * @param now 现在（运营日内的秒数）
 * @param positions 车次 → 列车位置（只有能对上在线列车的车次）
 */
export function liveStops(
  planned: PlannedStop[],
  realtime: Map<string, TripRealtime>,
  dayStart: number,
  now: number,
  positions: Map<string, TrainPosition> = new Map(),
): RideStop[] {
  // 实时数据还列着的、排得最前的一站：它之前的站都过了。
  const firstListed = planned.findIndex((s) => realtime.get(s.tripId)?.stops.has(s.station));
  const last = planned.length - 1;
  const seconds = (epoch: number) => Math.round((epoch - dayStart) / 1000);
  const times = planned.map((s, i) => {
    const rt = realtime.get(s.tripId);
    const predicted = rt?.stops.get(s.station);
    const delay = rt?.delaySeconds ?? 0;
    const arrivalAt = predicted?.arrival ?? predicted?.departure;
    const arrival = arrivalAt !== undefined ? seconds(arrivalAt) : s.arrival + delay;
    // 只有到站的预计时刻时，按计划的停站时长推开车。
    const departure =
      i === last
        ? arrival
        : predicted?.departure !== undefined
          ? seconds(predicted.departure)
          : arrival + (s.departure - s.arrival);
    return { arrival, departure, passed: i < firstListed || departure <= now };
  });
  // 列车停着的那一站（下车站不算：到了就是到了）：是它停着的站，并且是实时数据里的当前站
  // 或按时刻还没开过（环线会多次经过同一站，按这个挑出这一圈的）；这一趟预计到这一站也不能还早——
  // 同一列车可能还在跑上一个车次（往返线反方向经过同一站），那时它停在这里不是这一趟。
  const stoppedAt = planned.findIndex(
    (s, i) =>
      i < last &&
      positions.get(s.tripId)?.stoppedAt === s.station &&
      (i === firstListed || !times[i]!.passed) &&
      times[i]!.arrival <= now + earlyArrival,
  );
  return planned.map((s, i) => {
    const { arrival, departure } = times[i]!;
    const position = positions.get(s.tripId);
    if (position) {
      // 停在下车站上就是到了。
      const reached = i === last && position.stoppedAt === s.station;
      const passed = stoppedAt >= 0 ? i < stoppedAt : times[i]!.passed || reached;
      return { station: s.station, arrival, departure, passed, dwelling: i === stoppedAt };
    }
    const { passed } = times[i]!;
    const current = realtime.has(s.tripId) ? i === firstListed : true;
    return {
      station: s.station,
      arrival,
      departure,
      passed,
      dwelling: !passed && current && arrival <= now,
    };
  });
}

/** plannedStops 与 liveStops 合在一起（测试与一次性计算用）。 */
export function legStops(
  timetable: Timetable,
  leg: LiveLeg,
  realtime: Map<string, TripRealtime>,
  dayStart: number,
  now: number,
  positions?: Map<string, TrainPosition>,
): RideStop[] {
  return liveStops(plannedStops(timetable, leg), realtime, dayStart, now, positions);
}

export type RideStatus = (
  | {
      kind: "wait";
      legIndex: number;
      departsIn: number;
      /** 列车已经进站，停在站台上等开车。 */
      atPlatform: boolean;
    }
  | { kind: "walk"; legIndex: number; startsIn: number; arrivesIn: number }
  | {
      kind: "ride";
      legIndex: number;
      /** 还有几站到下车站（正停着的那一站不算）。 */
      stopsLeft: number;
      nextStop: string;
      arrivesIn: number;
      /** 列车正停在途中的这一站。 */
      dwellingAt?: string;
    }
  | { kind: "arrived" }
) & {
  /** 整趟走了多少，0 到 1（按预计出发、到达的时刻）。 */
  progress: number;
};

/**
 * 此刻在哪一步：等车（上车站或换乘站）、步行、在车上（还有几站、是不是正停站）、已到达。
 * 列车开出上车站才算上了车；开出之前列车已经进站时，等车写「已进站」。
 * @param stops 各段的站（legStops），步行段是空数组
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
    const [boarding, ...rest] = stops[legIndex] ?? [];
    // 还没读到各站（时刻表没到）时按出发时刻判断。
    if (!(boarding ? boarding.passed : now >= leg.live.departure)) {
      return {
        kind: "wait",
        legIndex,
        departsIn: left(boarding?.departure ?? leg.live.departure),
        atPlatform: !!boarding?.dwelling,
        progress,
      };
    }
    const ahead = rest.filter((s) => !s.passed && !s.dwelling);
    const next = ahead[0];
    if (next) {
      return {
        kind: "ride",
        legIndex,
        stopsLeft: ahead.length,
        nextStop: next.station,
        arrivesIn: left(rest[rest.length - 1]!.arrival),
        dwellingAt: rest.find((s) => s.dwelling)?.station,
        progress,
      };
    }
  }
  return { kind: "arrived", progress };
}

/** 下车提醒的时刻：前一站开出时（下一站就下车）；只坐一站时就是开车时。 */
export function alightReminderAt(stops: RideStop[], leg: LiveLeg): number {
  return stops[stops.length - 2]?.departure ?? leg.live.departure;
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
    const train = status.atPlatform ? `已进站，${when}` : when;
    return {
      title:
        previous?.kind === "ride"
          ? `${name(leg.from)} 换乘${platform ? ` · ${platform}` : ""}`
          : `${platform || `${name(leg.from)} `}上车`,
      detail: `${trainOf(leg)} · ${train}`,
    };
  }
  // 车上：此刻在哪（停靠哪一站，或开往哪一站）与在哪下车。
  if (status.stopsLeft > 1) {
    return {
      title: `还有 ${status.stopsLeft} 站 · ${minutes(status.arrivesIn)} 分`,
      detail: `${
        status.dwellingAt ? `停靠 ${name(status.dwellingAt)}` : `下一站 ${name(status.nextStop)}`
      } · 在 ${name(leg.to)} 下车`,
    };
  }
  const after = legs[status.legIndex + 1];
  return {
    title: `下一站 ${name(leg.to)} 下车`,
    detail: !after
      ? `终点站 · 预计 ${clockOf(leg.live.arrival)} 到站`
      : after.kind === "walk"
        ? `下车后步行到 ${name(after.to)}`
        : `换乘 ${trainOf(after)}${after.platform ? ` · ${after.platform} 号站台` : ""}`,
  };
}

export type CollapsedItem = { kind: "row"; index: number } | { kind: "gap"; count: number };

/**
 * 本段各站收起时留下哪几站：还没上车时是上车站；车上是刚开过的站与下一站（或正停着的站）；
 * 总是留下车站。跳过的站收成一段（「展开另 N 站」），开头跳过的也算一段。
 * @param count 这一段的站数（legStops 的长度，含上车站与下车站）
 * @param next 第一个列车还没开过的站的下标
 */
export function collapsedStops({
  count,
  next,
  boarded,
}: {
  count: number;
  next: number;
  boarded: boolean;
}): CollapsedItem[] {
  const last = count - 1;
  const kept = new Set<number>([last]);
  if (!boarded) kept.add(0);
  else if (next >= 0) {
    if (next > 0) kept.add(next - 1);
    kept.add(next);
  }
  const items: CollapsedItem[] = [];
  let previous = -1;
  for (const index of [...kept].sort((a, b) => a - b)) {
    if (index - previous > 1) items.push({ kind: "gap", count: index - previous - 1 });
    items.push({ kind: "row", index });
    previous = index;
  }
  return items;
}
