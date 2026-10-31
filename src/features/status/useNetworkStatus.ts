import { useHomeStation } from "@/lib/homeStation.ts";
import { useAlerts, useCatalog, useNow, useTrains, useTripUpdates } from "@/lib/queries.ts";
import { sourceTimeZone } from "@/lib/railApi.ts";
import { buildNetworkStatus } from "./networkStatus.ts";

/**
 * 本站所在服务器的运行状态。线路目录与通告到齐就能给出停运、班次取消；
 * 读取列车与行程更新时再补上晚点和「暂无运营列车」。
 * @param includeTrains 是否读取列车与行程更新。运行状态页一直读；看板只在已经读取列车位置时才用，
 *   不为一条提示多发请求（同一查询已有数据时直接复用）。
 */
export function useNetworkStatus(includeTrains = true) {
  const { serverId } = useHomeStation();
  const now = useNow();
  const catalog = useCatalog();
  const alerts = useAlerts(serverId);
  const trains = useTrains(includeTrains);
  const tripUpdates = useTripUpdates(serverId, includeTrains);
  const trainsReady = !includeTrains || trains.data;

  const status =
    catalog.data && alerts.data && trainsReady
      ? buildNetworkStatus({
          lines: catalog.data.lines.filter((l) => l.serverId === serverId),
          alerts: alerts.data,
          trains: trains.data?.trains ?? [],
          tripUpdates: tripUpdates.data,
          now,
        })
      : undefined;

  return {
    status,
    loading: catalog.isPending || alerts.isPending || (includeTrains && trains.isPending),
    /** 通告最近一次读到的时刻。 */
    updatedAt: alerts.dataUpdatedAt || undefined,
    timeZone: sourceTimeZone(catalog.data, serverId),
    error: catalog.error ?? alerts.error ?? trains.error,
  };
}
