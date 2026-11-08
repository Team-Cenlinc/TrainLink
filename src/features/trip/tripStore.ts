import { useSyncExternalStore } from "react";
import { sameStation, type HomeStation } from "@/lib/homeStation.ts";

/**
 * 「最近」与「收藏」的行程（起点 → 终点），保存在浏览器本地。写法同 lib/homeStation.ts：
 * 内存里缓存当前值，写入 localStorage 后通知订阅的组件。
 */
export interface TripRoute {
  from: HomeStation;
  to: HomeStation;
}

const recentKey = "trainlink.recentTrips";
const savedKey = "trainlink.savedTrips";
/** 最近的行程最多记几条。 */
const recentLimit = 5;

/**
 * 两个车站算不算同一站：默认同一运营方、同一站码；有 catalog 时传 lib/hubs.ts 的 sameHub，
 * 同一枢纽从哪一家的成员站查的都算同一条行程。
 */
export type SameStation = (a: HomeStation, b: HomeStation) => boolean;

const sameRoute = (a: TripRoute, b: TripRoute, same: SameStation = sameStation) =>
  same(a.from, b.from) && same(a.to, b.to);

const isRoutes = (value: unknown): value is TripRoute[] =>
  Array.isArray(value) &&
  value.every(
    (r) =>
      typeof r === "object" &&
      r !== null &&
      typeof (r as TripRoute).from?.stationCode === "string" &&
      typeof (r as TripRoute).to?.stationCode === "string",
  );

function load(key: string): TripRoute[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return isRoutes(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(key: string, value: TripRoute[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存不下也不影响本次使用。
  }
}

let recent = load(recentKey);
let saved = load(savedKey);
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** 查询过一次行程：放到「最近」最前面，去掉重复的。 */
export function rememberTrip(route: TripRoute, same?: SameStation) {
  recent = [route, ...recent.filter((r) => !sameRoute(r, route, same))].slice(0, recentLimit);
  save(recentKey, recent);
  notify();
}

/** 收藏或取消收藏一条行程。 */
export function toggleSavedTrip(route: TripRoute, same?: SameStation) {
  saved = saved.some((r) => sameRoute(r, route, same))
    ? saved.filter((r) => !sameRoute(r, route, same))
    : [...saved, route];
  save(savedKey, saved);
  notify();
}

/** 清空最近与收藏的行程（设置页「清除本地数据」）。 */
export function clearTrips() {
  recent = [];
  saved = [];
  save(recentKey, recent);
  save(savedKey, saved);
  notify();
}

export function useRecentTrips(): TripRoute[] {
  return useSyncExternalStore(subscribe, () => recent);
}

export function useSavedTrips(): TripRoute[] {
  return useSyncExternalStore(subscribe, () => saved);
}

export function isSavedTrip(routes: TripRoute[], route: TripRoute, same?: SameStation): boolean {
  return routes.some((r) => sameRoute(r, route, same));
}

/** 车站写进网址：SURC:PTK（服务器跟随本站）。 */
export const stationParam = (s: HomeStation) => `${s.operatorCode}:${s.stationCode}`;

/**
 * 乘坐指南（guide）或乘车 GO（go）的网址：按日期、出发时刻与第一段车次找回同一个方案，
 * 车次取消或时刻表变了不会换成别的车。只步行的方案没有车次。
 */
export function journeyHref(
  page: "guide" | "go",
  ends: { from: HomeStation; to: HomeStation },
  journey: { date: string; departure: number; tripId?: string },
): string {
  const query = new URLSearchParams({
    from: stationParam(ends.from),
    to: stationParam(ends.to),
    date: journey.date,
    dep: String(journey.departure),
  });
  if (journey.tripId) query.set("trip", journey.tripId);
  return `/trip/${page}?${query}`;
}

export function stationFromParam(value: string | null, serverId: string): HomeStation | undefined {
  const [operatorCode, stationCode] = value?.split(":") ?? [];
  return operatorCode && stationCode ? { serverId, operatorCode, stationCode } : undefined;
}
