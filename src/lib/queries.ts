import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchBoard, fetchCatalog } from "./railApi.ts";
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

/** 车站站牌，每 10 秒刷新一次；页面在后台时 TanStack Query 会自动暂停刷新。 */
export function useBoard(station: HomeStation) {
  return useQuery({
    queryKey: ["board", station.serverId, station.operatorCode, station.stationCode],
    queryFn: ({ signal }) =>
      fetchBoard(station.serverId, station.operatorCode, station.stationCode, signal),
    refetchInterval: 10_000,
    staleTime: 5_000,
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
