import { useSyncExternalStore } from "react";

/**
 * 「本站」与「常用车站」：保存在浏览器本地，整个 App 共用。
 * 用一个极小的外部存储（读写 localStorage + 通知订阅者），组件通过 useSyncExternalStore 订阅：
 * 任何地方切换本站，看板、侧边栏等所有用到它的组件都会一起更新。
 */
export interface HomeStation {
  serverId: string;
  operatorCode: string;
  stationCode: string;
}

const homeKey = "trainlink.homeStation";
const favoritesKey = "trainlink.favoriteStations";

export const defaultHomeStation: HomeStation = {
  serverId: "survival",
  operatorCode: "SURC",
  stationCode: "PTK",
};

/** 两个车站是否同一个（同服务器、同运营商、同站码）。 */
export function sameStation(a: HomeStation, b: HomeStation): boolean {
  return (
    a.serverId === b.serverId &&
    a.operatorCode === b.operatorCode &&
    a.stationCode === b.stationCode
  );
}

const isStation = (value: unknown): value is HomeStation =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as HomeStation).serverId === "string" &&
  typeof (value as HomeStation).operatorCode === "string" &&
  typeof (value as HomeStation).stationCode === "string";

/** 读本地存储；隐私模式或存储被禁用时 localStorage 可能抛错，此时用默认值。 */
function load<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (valid(parsed)) return parsed;
    }
  } catch {
    // 忽略：使用默认值。
  }
  return fallback;
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存不下也不影响本次使用，只是下次打开不会记住。
  }
}

// 当前值缓存在内存里：useSyncExternalStore 要求同一状态返回同一个对象，否则会无限重渲染。
let home = load(homeKey, defaultHomeStation, isStation);
let favorites = load(
  favoritesKey,
  [home],
  (v): v is HomeStation[] => Array.isArray(v) && v.every(isStation),
);
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 读取本站（不订阅变化），用于非组件代码。 */
export function readHomeStation(): HomeStation {
  return home;
}

/** 切换本站。新的本站自动加入常用车站。 */
export function setHomeStation(station: HomeStation) {
  home = station;
  save(homeKey, home);
  if (!favorites.some((f) => sameStation(f, station))) {
    favorites = [...favorites, station];
    save(favoritesKey, favorites);
  }
  notify();
}

/** 加入或移出常用车站。 */
export function toggleFavorite(station: HomeStation) {
  favorites = favorites.some((f) => sameStation(f, station))
    ? favorites.filter((f) => !sameStation(f, station))
    : [...favorites, station];
  save(favoritesKey, favorites);
  notify();
}

/** 当前本站；切换后组件自动重新渲染。 */
export function useHomeStation(): HomeStation {
  return useSyncExternalStore(subscribe, () => home);
}

/** 常用车站列表。 */
export function useFavoriteStations(): HomeStation[] {
  return useSyncExternalStore(subscribe, () => favorites);
}
