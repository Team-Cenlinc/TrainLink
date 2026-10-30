import { useTripUpdates } from "@/lib/queries.ts";
import type { BoardData } from "@/features/board/useBoardData.ts";
import { buildTrainDetail } from "./trainDetail.ts";

/**
 * 某列车的详情数据。只有打开详情时（trainName 有值）才读取 GTFS-RT 行程更新；
 * 其余数据（列车位置、站序、站牌）看板已经在读，直接复用。
 */
export function useTrainDetail(data: BoardData, trainName: string | undefined) {
  const tripUpdates = useTripUpdates(data.home.serverId, Boolean(trainName));
  const train = trainName ? data.trains.data?.trains.find((t) => t.name === trainName) : undefined;
  const line = train && (data.lines.find((l) => l.lineCode === train.lineCode) ?? data.primaryLine);

  const detail =
    train && line
      ? buildTrainDetail({
          train,
          line,
          serverId: data.home.serverId,
          homeStationCode: data.home.stationCode,
          routeStops: train.routeCode ? data.gtfs.data?.routeStops.get(train.routeCode) : undefined,
          headsign: train.routeCode ? data.gtfs.data?.headsigns.get(train.routeCode) : undefined,
          tripUpdate: tripUpdates.data?.get(train.name),
          departure: data.board.data?.departures.find((d) => d.train === train.name),
          catalog: data.catalog,
          now: data.now,
        })
      : undefined;

  return { detail, loading: tripUpdates.isPending };
}
