import { useMemo } from "react";
import { lineKey } from "@/lib/gtfs.ts";
import { lineShape } from "@/lib/lineShape.ts";
import { useHomeStation } from "@/lib/homeStation.ts";
import { useBoard, useCarLoads, useCatalog, useGtfs, useNow, useTrains } from "@/lib/queries.ts";
import { sourceTimeZone } from "@/lib/railApi.ts";
import { useShownOperators } from "@/lib/settings.ts";
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
  const carLoads = useCarLoads(home.serverId, trainsEnabled);

  // catalog 只在刷新时才换成新对象，按它与本站缓存查找结果，不必每次重绘（每 15 秒一次的时钟）都查一遍。
  const station = useMemo(
    () => findStation(catalog.data, home.serverId, home.operatorCode, home.stationCode),
    [catalog.data, home.serverId, home.operatorCode, home.stationCode],
  );
  const lines = useMemo(() => (station ? servingLines(station) : []), [station]);
  const linePatterns = gtfs.data?.linePatterns;
  // 有站序数据（GTFS 里有车次）的线路才能画列车位置；停运检修的线路没有。
  // 全线视图只列设置里显示的运营方的线路；本站的线路全被隐藏时照常全列，免得线路视图空着。
  const shown = useShownOperators();
  const drawable = lines.filter((l) => linePatterns?.has(lineKey(l.operatorCode, l.lineCode)));
  const shownLines = drawable.filter((l) => shown.byCode(home.serverId, l.operatorCode));
  const orderedLines = shownLines.length > 0 ? shownLines : drawable;
  const primaryLine =
    orderedLines.find((l) => l.lineCode === preferredLine) ?? orderedLines[0] ?? lines[0];
  // 线路形状：本站所在的那一支画成主干，其余支线接在后面（见 lib/lineShape.ts）。
  const shape = useMemo(() => {
    const patterns =
      primaryLine && linePatterns?.get(lineKey(primaryLine.operatorCode, primaryLine.lineCode));
    return patterns ? lineShape(patterns, home.stationCode) : undefined;
  }, [primaryLine, linePatterns, home.stationCode]);
  const strip =
    station && primaryLine ? neighbourStops(catalog.data, shape?.main, station, primaryLine) : [];
  const transfers = station ? transferLines(station) : [];
  const nearest =
    station && primaryLine && transfers.length === 0
      ? nearestTransfer(catalog.data, shape?.main, station, primaryLine)
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

  const lineOrder = shape?.main;
  // 列车位置只随列车、站牌、GTFS 等数据变化，不随时钟变化；缓存起来，避免每次重绘都重新查站名。
  const lineLayout = useMemo(
    () =>
      trainsEnabled && primaryLine && shape && trains.data
        ? buildLineLayout({
            order: shape.main,
            branches: shape.branches,
            line: primaryLine,
            serverId: home.serverId,
            stationCode: home.stationCode,
            trains: trains.data.trains,
            headsigns: gtfs.data?.headsigns ?? new Map(),
            routeStops: gtfs.data?.routeStops,
            departures: board.data?.departures ?? [],
            carLoads: carLoads.data,
            catalog: catalog.data,
          })
        : undefined,
    [
      trainsEnabled,
      primaryLine,
      shape,
      trains.data,
      home.serverId,
      home.stationCode,
      gtfs.data,
      board.data,
      carLoads.data,
      catalog.data,
    ],
  );

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
    carLoads,
    lineOrder,
    lineLayout,
  };
}

export type BoardData = ReturnType<typeof useBoardData>;
