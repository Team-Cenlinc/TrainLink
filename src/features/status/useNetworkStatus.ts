import { useHomeStation } from "@/lib/homeStation.ts";
import { useAlerts, useCatalog, useNow, useTrains, useTripUpdates } from "@/lib/queries.ts";
import { sourceTimeZone } from "@/lib/railApi.ts";
import { useShownOperators } from "@/lib/settings.ts";
import { buildNetworkStatus } from "./networkStatus.ts";

/**
 * 本站所在服务器的运行状态。线路目录与通告到齐就能给出停运、班次取消（这两样与列车、
 * 行程更新都存在本地缓存里，打开时先用缓存）；读到列车与行程更新再补上晚点和「暂无运营列车」。
 * 列车或行程更新读取失败时不整页报错：停运、班次取消照常显示，晚点标为暂缺（status.delaysKnown）。
 * @param includeTrains 是否读取列车与行程更新。运行状态页读；看板的运行提示不读，
 *   不为一条提示多发请求。不读时也不用别处缓存下来的列车与行程更新：
 *   这里的查询是停用的，缓存不会再刷新，用它会把几分钟前的晚点一直挂在看板上。
 */
export function useNetworkStatus(includeTrains = true) {
  const { serverId } = useHomeStation();
  const now = useNow();
  const catalog = useCatalog();
  const alerts = useAlerts(serverId);
  const trains = useTrains(includeTrains);
  const tripUpdates = useTripUpdates(serverId, includeTrains);
  const shown = useShownOperators();
  // 读取失败时 TanStack Query 仍留着上一次的数据，但那已经不新了，按读不到处理。
  const trainList = includeTrains && !trains.isError ? trains.data?.trains : undefined;
  const tripMap = includeTrains && !tripUpdates.isError ? tripUpdates.data : undefined;
  // 列车与行程更新还在第一次读取（本地缓存里也没有）：先不等它，用目录与通告把停运、
  // 班次取消画出来，页面不空白；晚点这一块标「读取中」，数据到了再补上。
  const liveLoading = includeTrains && (trains.isPending || tripUpdates.isPending);

  const status =
    catalog.data && alerts.data
      ? buildNetworkStatus({
          // 本服务器上、设置里显示的运营方的线路。
          lines: catalog.data.lines.filter(
            (l) => l.serverId === serverId && shown.byId(l.operatorId),
          ),
          operators: catalog.data.operators,
          alerts: alerts.data,
          trains: trainList,
          tripUpdates: tripMap,
          now,
        })
      : undefined;

  return {
    status,
    loading: catalog.isPending || alerts.isPending,
    /** 列车与行程更新还在第一次读取：status 里说不准的线路是「读取中」，不是「读不到」。 */
    liveLoading,
    /** 通告最近一次读到的时刻。 */
    updatedAt: alerts.dataUpdatedAt || undefined,
    timeZone: sourceTimeZone(catalog.data, serverId),
    error: catalog.error ?? alerts.error,
  };
}
