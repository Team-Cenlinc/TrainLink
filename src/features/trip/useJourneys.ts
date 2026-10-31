import { useMemo } from "react";
import type { HomeStation } from "@/lib/homeStation.ts";
import { useCatalog, useNow, useTripRealtime } from "@/lib/queries.ts";
import { sourceTimeZone } from "@/lib/railApi.ts";
import type { TripRealtime } from "@/lib/realtime.ts";
import { findJourney, liveJourneys } from "./live.ts";
import { useTimetable } from "./queries.ts";
import {
  dayLabel,
  dayStartOf,
  departureDayStart,
  serviceClock,
  serviceDate,
} from "./serviceDay.ts";

const noRealtime = new Map<string, TripRealtime>();

/** 时刻表、实时数据与现在的时刻（服务器时区），每 15 秒随时间更新。 */
function useTripData(serverId: string) {
  const catalog = useCatalog();
  const timetable = useTimetable(serverId);
  const realtime = useTripRealtime(serverId);
  const now = useNow();
  const timeZone = sourceTimeZone(catalog.data, serverId);
  return {
    timetable,
    realtime: realtime.data ?? noRealtime,
    now,
    timeZone,
    today: serviceClock(now, timeZone).dayStart,
  };
}

/**
 * 从 from 到 to 的几个行程方案，套上实时数据（预计时刻；取消的车次不用；晚点还没开的车照样列出）。
 * @param when.at 指定出发时刻（运营日内的秒数）；省略时用现在。
 * @param when.date 指定时刻是哪一天（"2026-11-01"，规划页查询时定好写进网址）；
 *   没有时按现在推算：比现在早的时刻指明天。
 */
export function useJourneys(
  from: HomeStation | undefined,
  to: HomeStation | undefined,
  when: { at?: number; date?: string | null },
  count: number,
) {
  const { timetable, realtime, now, timeZone, today } = useTripData(from?.serverId ?? "survival");
  const dayStart =
    when.at === undefined
      ? today
      : (dayStartOf(when.date ?? null, timeZone) ?? departureDayStart(when.at, now, timeZone));
  // 这一天 0 点起「现在」的秒数：查明天时是负数，查过去的日期时超过一天。
  const nowSeconds = Math.floor((now - dayStart) / 1000);
  const departAfter = Math.max(when.at ?? nowSeconds, nowSeconds);
  const sameStation = !!from && !!to && from.stationCode === to.stationCode;

  const journeys = useMemo(
    () =>
      timetable.data && from && to && !sameStation
        ? liveJourneys(
            timetable.data,
            { from: from.stationCode, to: to.stationCode, departAfter, count },
            realtime,
            dayStart,
          )
        : undefined,
    [
      timetable.data,
      from?.stationCode,
      to?.stationCode,
      sameStation,
      departAfter,
      count,
      realtime,
      dayStart,
    ],
  );

  return {
    journeys,
    /** 查的那一天 0 点起「现在」的秒数，用来写「N 分后出发」。 */
    nowSeconds,
    /** 查的那一天的运营日 0 点（毫秒）与日期、叫法（今天、明天）。 */
    dayStart,
    date: serviceDate(dayStart, timeZone),
    dayLabel: dayLabel(dayStart, today, timeZone),
    /** 起点和终点是同一个车站。 */
    sameStation,
    loading: timetable.isPending,
    error: timetable.error,
  };
}

/**
 * 乘坐指南：找回「行程方案」里选中的那个方案（同一天、同一出发时刻、同一车次），套上实时数据。
 * 选中的车取消了时 cancelled 为 true；时刻表里找不到时 journey 为 undefined，不拿别的车顶替。
 */
export function useJourney(
  from: HomeStation | undefined,
  to: HomeStation | undefined,
  selected: { date: string | null; departure: number | undefined; tripId: string | undefined },
) {
  const { timetable, realtime, timeZone, today } = useTripData(from?.serverId ?? "survival");
  const dayStart = dayStartOf(selected.date, timeZone) ?? today;
  const { departure, tripId } = selected;

  const found = useMemo(
    () =>
      timetable.data && from && to && departure !== undefined
        ? findJourney(
            timetable.data,
            { from: from.stationCode, to: to.stationCode, departure, tripId },
            realtime,
            dayStart,
          )
        : undefined,
    [timetable.data, from?.stationCode, to?.stationCode, departure, tripId, realtime, dayStart],
  );

  return {
    journey: found?.journey,
    cancelled: found?.cancelled ?? false,
    dayStart,
    loading: timetable.isPending,
    error: timetable.error,
  };
}
