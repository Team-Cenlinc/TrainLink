import { lineKey } from "@/lib/gtfs.ts";
import { useHomeStation } from "@/lib/homeStation.ts";
import { useBoard, useCatalog, useGtfs, useNow, useTrains } from "@/lib/queries.ts";
import { sourceTimeZone } from "@/lib/railApi.ts";
import {
  blueMapUrl,
  findStation,
  nearestTransfer,
  neighbourStops,
  servingLines,
  transferLines,
} from "@/lib/station.ts";
import { groupByPlatform } from "./departures.ts";
import { buildLineLayout } from "./linePositions.ts";

/**
 * 看板的全部数据：读取本站、站牌、GTFS 与列车位置，并整理成界面要用的形状。
 * 手机布局（CompactBoard）与大屏布局（WideBoard）共用它，两边只负责排版。
 *
 * @param trainsEnabled 是否读取列车位置。手机上只在打开「线路」视图时读取；大屏一直显示。
 * @param preferredLine 换乘站上用户选中的线路码；省略或不可用时取第一条有站序数据的线路。
 */
export function useBoardData(trainsEnabled: boolean, preferredLine?: string) {
  // 订阅本站：在车站选择器里切换后，这里拿到新的本站，所有查询随之换成新车站。
  const home = useHomeStation();
  const now = useNow();
  const catalog = useCatalog();
  const board = useBoard(home);
  const gtfs = useGtfs(home.serverId);
  const trains = useTrains(trainsEnabled);

  const station = findStation(catalog.data, home.serverId, home.operatorCode, home.stationCode);
  const lines = station ? servingLines(station) : [];
  const lineOrders = gtfs.data?.lineOrders;
  // 有站序数据（GTFS 里有车次）的线路才能画列车位置；停运检修的线路没有。
  const orderedLines = lines.filter((l) => lineOrders?.has(lineKey(l.operatorCode, l.lineCode)));
  const primaryLine =
    orderedLines.find((l) => l.lineCode === preferredLine) ?? orderedLines[0] ?? lines[0];
  const strip =
    station && primaryLine ? neighbourStops(catalog.data, lineOrders, station, primaryLine) : [];
  const transfers = station ? transferLines(station) : [];
  const nearest =
    station && primaryLine && transfers.length === 0
      ? nearestTransfer(catalog.data, lineOrders, station, primaryLine)
      : undefined;
  const timeZone = sourceTimeZone(board.data, home.serverId);
  const groups = board.data
    ? groupByPlatform(board.data.departures, {
        serverId: home.serverId,
        now,
        timeZone,
        catalog: catalog.data,
      })
    : [];

  const lineOrder = primaryLine
    ? lineOrders?.get(lineKey(primaryLine.operatorCode, primaryLine.lineCode))
    : undefined;
  const lineLayout =
    trainsEnabled && primaryLine && lineOrder && trains.data
      ? buildLineLayout({
          order: lineOrder,
          line: primaryLine,
          serverId: home.serverId,
          stationCode: home.stationCode,
          trains: trains.data.trains,
          headsigns: gtfs.data?.headsigns ?? new Map(),
          departures: board.data?.departures ?? [],
          catalog: catalog.data,
        })
      : undefined;

  return {
    home,
    catalog: catalog.data,
    now,
    timeZone,
    station,
    stationName: station?.name ?? home.stationCode,
    lines,
    primaryLine,
    orderedLines,
    strip,
    transfers,
    nearest,
    mapUrl: station ? blueMapUrl(station) : undefined,
    board,
    groups,
    gtfs,
    trains,
    lineOrder,
    lineLayout,
  };
}

export type BoardData = ReturnType<typeof useBoardData>;
