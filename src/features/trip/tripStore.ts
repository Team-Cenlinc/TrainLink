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

const sameRoute = (a: TripRoute, b: TripRoute) =>
  sameStation(a.from, b.from) && sameStation(a.to, b.to);

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
export function rememberTrip(route: TripRoute) {
  recent = [route, ...recent.filter((r) => !sameRoute(r, route))].slice(0, recentLimit);
  save(recentKey, recent);
  notify();
}

/** 收藏或取消收藏一条行程。 */
export function toggleSavedTrip(route: TripRoute) {
  saved = saved.some((r) => sameRoute(r, route))
    ? saved.filter((r) => !sameRoute(r, route))
    : [...saved, route];
  save(savedKey, saved);
  notify();
}

export function useRecentTrips(): TripRoute[] {
  return useSyncExternalStore(subscribe, () => recent);
}

export function useSavedTrips(): TripRoute[] {
  return useSyncExternalStore(subscribe, () => saved);
}

export function isSavedTrip(routes: TripRoute[], route: TripRoute): boolean {
  return routes.some((r) => sameRoute(r, route));
}

/** 车站写进网址：SURC:PTK（服务器跟随本站）。 */
export const stationParam = (s: HomeStation) => `${s.operatorCode}:${s.stationCode}`;

export function stationFromParam(value: string | null, serverId: string): HomeStation | undefined {
  const [operatorCode, stationCode] = value?.split(":") ?? [];
  return operatorCode && stationCode ? { serverId, operatorCode, stationCode } : undefined;
}
