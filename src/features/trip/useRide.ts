import { useEffect, useMemo, useState } from "react";
import { useHomeStation } from "@/lib/homeStation.ts";
import { fallbackLineColor } from "@/lib/lineColor.ts";
import { useCatalog, useNow, useTrains, useTripRealtime } from "@/lib/queries.ts";
import { isStopped, stationKeyOfNode } from "@/features/board/linePositions.ts";
import type { TripRealtime } from "@/lib/realtime.ts";
import { stationName } from "./journeyText.ts";
import type { LiveJourney } from "./live.ts";
import { useTimetable } from "./queries.ts";
import { liveStops, plannedStops, rideStatus, rideText, type TrainPosition } from "./ride.ts";
import { lineOf, platformText } from "./stations.ts";
import { stationFromParam } from "./tripStore.ts";
import { useJourney } from "./useJourneys.ts";

const noRealtime = new Map<string, TripRealtime>();

/** 一个方案的身份：出发时刻与各段车次。实时数据更新时方案对象会换新，身份不变。 */
const journeyKey = (journey: LiveJourney | undefined) =>
  journey &&
  `${journey.departure}:${journey.legs.map((l) => (l.kind === "ride" ? l.tripId : l.to)).join(",")}`;

/**
 * 一趟乘车 GO 此刻的进度：按网址参数（与乘坐指南相同）找回方案，套上实时位置，
 * 算出走到哪一步、大字提示写什么。GO 页面与其他页面的「乘车中」迷你条共用。每 5 秒重算。
 *
 * 找到过方案之后，某次刷新暂时找不回来（实时数据一时对不上），仍按上一次的方案显示，
 * 不把人「刷」出 GO；只有车次确实取消了才算找不到。
 */
export function useRide(params: URLSearchParams) {
  const home = useHomeStation();
  const catalog = useCatalog();
  const from = stationFromParam(params.get("from"), home.serverId);
  const to = stationFromParam(params.get("to"), home.serverId);
  const depParam = params.get("dep");
  const dep = depParam && /^\d+$/.test(depParam) ? Number(depParam) : undefined;
  const found = useJourney(from, to, {
    date: params.get("date"),
    departure: dep,
    tripId: params.get("trip") ?? undefined,
  });
  const { cancelled, dayStart, loading, error } = found;

  // 上一次找到的方案（同一组参数）：这次没找到、车次也没取消时接着用它。
  const paramsKey = params.toString();
  const [kept, setKept] = useState<{ key: string; journey: LiveJourney }>();
  useEffect(() => {
    if (found.journey) setKept({ key: paramsKey, journey: found.journey });
  }, [found.journey, paramsKey]);
  const journey =
    found.journey ?? (!cancelled && kept?.key === paramsKey ? kept.journey : undefined);

  const serverId = from?.serverId ?? home.serverId;
  const timetable = useTimetable(serverId);
  const realtime = useTripRealtime(serverId).data ?? noRealtime;
  // 在线列车的位置：判断是不是正停在站上（同列车详情）。
  const trains = useTrains(true).data?.trains;
  const now = Math.floor((useNow(5_000) - dayStart) / 1000);
  const name = (code: string) => stationName(catalog.data, serverId, code);

  // 各段经过哪些站只跟方案有关，算一次；实时位置与时间每次重算（只是套一层，很便宜）。
  const planned = useMemo(
    () =>
      journey && timetable.data ? journey.legs.map((leg) => plannedStops(timetable.data, leg)) : [],
    // 方案对象每次实时数据更新都是新的，按它的身份（出发时刻与车次）判断换没换。
    [journeyKey(journey), timetable.data],
  );
  const positions = new Map<string, TrainPosition>();
  for (const stop of planned.flat()) {
    if (positions.has(stop.tripId)) continue;
    const trainName = realtime.get(stop.tripId)?.trainName;
    const train = trainName && trains?.find((t) => t.serverId === serverId && t.name === trainName);
    if (train) {
      positions.set(stop.tripId, {
        stoppedAt: isStopped(train) ? stationKeyOfNode(train.currentNode) : undefined,
      });
    }
  }
  const stops = planned.map((p) => liveStops(p, realtime, dayStart, now, positions));
  const status = journey ? rideStatus(journey, stops, now) : undefined;
  const platform = (leg: { from: string; platform?: string }) =>
    platformText(catalog.data, serverId, leg);
  const text = journey && status ? rideText(status, journey, name, platform) : undefined;
  // 此刻这一段有没有实时数据（列车位置）：没有时是按时刻表推算的。
  const currentLeg =
    status && status.kind !== "arrived" ? journey?.legs[status.legIndex] : undefined;
  const isLive = currentLeg?.kind === "ride" && currentLeg.tripIds.some((id) => realtime.has(id));
  const lineColorOf = (lineCode: string, operatorCode?: string) =>
    lineOf(catalog.data, serverId, lineCode, operatorCode)?.color ?? fallbackLineColor;

  return {
    from,
    to,
    dep,
    journey,
    cancelled,
    dayStart,
    loading,
    error,
    stops,
    status,
    text,
    isLive,
    /** 上车站台的一句话（枢纽里带运营方）。 */
    platform,
    now,
    name,
    lineColorOf,
  };
}
