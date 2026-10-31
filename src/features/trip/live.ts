import type { TripRealtime } from "@/lib/realtime.ts";
import { changeSeconds, type Journey, type Leg } from "./planner.ts";

/**
 * 把实时数据套到规划好的行程上：各段乘车的预计出发、到达，整个行程的预计到达与晚点，
 * 以及换乘是否可能赶不上。纯函数；时刻仍是「运营日 0 点起的秒数」。
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
  /** 某次换乘预计留不出 2 分钟。 */
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
    return {
      ...leg,
      live: {
        departure: toSeconds(at(leg.from)?.departure ?? at(leg.from)?.arrival) ?? leg.departure,
        arrival: toSeconds(at(leg.to)?.arrival ?? at(leg.to)?.departure) ?? leg.arrival,
      },
    };
  });

  // 相邻两段乘车之间（中间没有步行）要留出换乘时间；有步行时步行时间本身就是换乘。
  const riskyChange = legs.some((leg, i) => {
    const next = legs[i + 1];
    return (
      leg.kind === "ride" &&
      next?.kind === "ride" &&
      leg.live.arrival + changeSeconds > next.live.departure
    );
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
