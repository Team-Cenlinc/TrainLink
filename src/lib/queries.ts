import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchGtfsIndex } from "./gtfs.ts";
import { fetchBoard, fetchCatalog, fetchTrains } from "./railApi.ts";
import { fetchAlerts, fetchCarLoads, fetchTripUpdates } from "./realtime.ts";
import type { HomeStation } from "./homeStation.ts";

/**
 * 数据读取用 TanStack Query：它负责缓存、去重、后台刷新和失败重试，
 * 组件只需要读 data / isPending / error，不用自己写 useEffect + fetch。
 * 刷新间隔与 API 的 Cache-Control 对齐，比它更频繁没有意义。
 */

/** 线路与车站目录，60 秒内视为新鲜。 */
export function useCatalog() {
  return useQuery({
    queryKey: ["catalog"],
    queryFn: ({ signal }) => fetchCatalog(signal),
    staleTime: 60_000,
  });
}

/**
 * 车站站牌，每 15 秒刷新一次；页面在后台时 TanStack Query 会自动暂停刷新。
 * 用 API 默认的时间范围，看板每个方向只显示最近几班。
 */
export function useBoard(station: HomeStation) {
  return useQuery({
    queryKey: ["board", station.serverId, station.operatorCode, station.stationCode],
    queryFn: ({ signal }) =>
      fetchBoard(station.serverId, station.operatorCode, station.stationCode, { signal }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

/** GTFS 索引（线路站序与交路终点），5 分钟内视为新鲜。 */
export function useGtfs(serverId: string) {
  return useQuery({
    queryKey: ["gtfs", serverId],
    queryFn: ({ signal }) => fetchGtfsIndex(serverId, signal),
    staleTime: 5 * 60_000,
  });
}

/**
 * 在线列车，每 15 秒刷新一次（与站牌同步）。
 * enabled 为 false 时不请求：只有打开「线路」视图才需要列车位置。
 */
export function useTrains(enabled: boolean) {
  return useQuery({
    queryKey: ["trains"],
    queryFn: ({ signal }) => fetchTrains(signal),
    refetchInterval: 15_000,
    staleTime: 10_000,
    enabled,
  });
}

/**
 * GTFS-Realtime 行程更新（各列车接下来各站的预计时刻），每 15 秒刷新。
 * 只在打开列车详情时读取。
 */
export function useTripUpdates(serverId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["tripUpdates", serverId],
    queryFn: ({ signal }) => fetchTripUpdates(serverId, signal),
    refetchInterval: 15_000,
    staleTime: 10_000,
    enabled,
  });
}

/**
 * 线上各列车每节车厢的满载率，每 15 秒刷新（与列车位置同步）。
 * 与 useTrains 一样，只在显示线路视图时读取。
 */
export function useCarLoads(serverId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["carLoads", serverId],
    queryFn: ({ signal }) => fetchCarLoads(serverId, signal),
    refetchInterval: 15_000,
    staleTime: 10_000,
    enabled,
  });
}

/** 运营通告（停运、班次取消与公告），变化不频繁，每分钟刷新一次。 */
export function useAlerts(serverId: string) {
  return useQuery({
    queryKey: ["alerts", serverId],
    queryFn: ({ signal }) => fetchAlerts(serverId, signal),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/**
 * 当前时间，每隔 intervalMs 更新一次，用来让「N 分」随时间走动。
 * 这是一个最小的自定义 Hook 示例：useState 存值，useEffect 启动并清理定时器。
 */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
