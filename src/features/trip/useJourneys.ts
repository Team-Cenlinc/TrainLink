import { useMemo } from "react";
import type { HomeStation } from "@/lib/homeStation.ts";
import { useCatalog, useNow } from "@/lib/queries.ts";
import { sourceTimeZone } from "@/lib/railApi.ts";
import { applyRealtime, type LiveJourney } from "./live.ts";
import { planJourneys } from "./planner.ts";
import { useTimetable, useTripRealtime } from "./queries.ts";
import { serviceClock } from "./serviceDay.ts";

/**
 * 从 from 到 to 的几个行程方案，套上实时数据（预计时刻、取消的车次不用）。
 * @param departAfter 指定出发时刻（运营日内的秒数）；省略时用现在，每 15 秒随时间更新。
 */
export function useJourneys(
  from: HomeStation | undefined,
  to: HomeStation | undefined,
  departAfter: number | undefined,
  count: number,
) {
  const serverId = from?.serverId ?? "survival";
  const catalog = useCatalog();
  const timetable = useTimetable(serverId);
  const realtime = useTripRealtime(serverId);
  const now = useNow();
  const clock = serviceClock(now, sourceTimeZone(catalog.data, serverId));
  const after = departAfter ?? clock.seconds;

  const cancelledTrips = useMemo(
    () =>
      new Set(
        [...(realtime.data ?? [])].filter(([, trip]) => trip.cancelled).map(([tripId]) => tripId),
      ),
    [realtime.data],
  );
  const planned = useMemo(
    () =>
      timetable.data && from && to
        ? planJourneys(timetable.data, {
            from: from.stationCode,
            to: to.stationCode,
            departAfter: after,
            count,
            cancelledTrips,
          })
        : undefined,
    [timetable.data, from?.stationCode, to?.stationCode, after, count, cancelledTrips],
  );
  const journeys: LiveJourney[] | undefined = planned?.map((j) =>
    applyRealtime(j, realtime.data ?? new Map(), clock.dayStart),
  );

  return {
    journeys,
    /** 运营日内「现在」的秒数，用来写「N 分后出发」。 */
    nowSeconds: clock.seconds,
    loading: timetable.isPending,
    error: timetable.error,
  };
}
