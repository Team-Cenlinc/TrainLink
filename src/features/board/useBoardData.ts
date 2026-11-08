import { useMemo } from "react";
import { operatorLabel } from "@/features/trip/stations.ts";
import { lineKey } from "@/lib/gtfs.ts";
import { hubLines, hubOf } from "@/lib/hubs.ts";
import { lineShape } from "@/lib/lineShape.ts";
import { useHomeStation } from "@/lib/homeStation.ts";
import { useBoards, useCarLoads, useCatalog, useGtfs, useNow, useTrains } from "@/lib/queries.ts";
import { sourceTimeZone, type RailBoard } from "@/lib/railApi.ts";
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
 * 本站在枢纽里时（两家运营方的车站合成一个站，见 lib/hubs.ts），标题、线路与列车位置按整个枢纽；
 * 站牌一次只看一家（parts 里选中的那一家）：站台号只在运营方内唯一，两家的站台 1 不能混在一起。
 *
 * @param trainsEnabled 是否读取列车位置。手机上只在打开「线路」视图时读取；大屏一直显示。
 * @param preferredLine 换乘站上用户选中的线路（运营方:线路码）；省略或不可用时取第一条有站序数据的线路。
 * @param preferredOperator 枢纽上用户选中的运营方码；省略时是本站所属的那一家。
 */
export function useBoardData(
  trainsEnabled: boolean,
  preferredLine?: string,
  preferredOperator?: string,
) {
  // 订阅本站：在车站选择器里切换后，这里拿到新的本站，所有查询随之换成新车站。
  const home = useHomeStation();
  const now = useNow();
  const catalog = useCatalog();
  const gtfs = useGtfs(home.serverId);
  const trains = useTrains(trainsEnabled);
  const carLoads = useCarLoads(home.serverId, trainsEnabled);
  const shown = useShownOperators();

  // catalog 只在刷新时才换成新对象，按它与本站缓存查找结果，不必每次重绘（每 15 秒一次的时钟）都查一遍。
  const station = useMemo(
    () => findStation(catalog.data, home.serverId, home.operatorCode, home.stationCode),
    [catalog.data, home.serverId, home.operatorCode, home.stationCode],
  );
  // 枢纽的各家：每家一个成员站，只留设置里显示的运营方（全被隐藏时至少留本站）。
  const hub = useMemo(() => station && hubOf(catalog.data, station), [catalog.data, station]);
  const parts = useMemo(() => {
    if (!station || !hub) return [];
    const visible = hub.members.filter((m) => shown.byId(m.operatorId));
    return (visible.length ? visible : [station]).map((member) => {
      const operator = catalog.data?.operators.find((o) => o.id === member.operatorId);
      return {
        station: member,
        operatorCode: operator?.code ?? "",
        operatorName: operator ? operatorLabel(operator) : "",
        lines: servingLines(member),
      };
    });
  }, [station, hub, shown, catalog.data]);
  const part =
    parts.find((p) => p.operatorCode === preferredOperator) ??
    parts.find((p) => p.station === station) ??
    parts[0];
  /** 某家运营方在这个枢纽里的成员站；不是枢纽时就是本站。 */
  const memberOf = (operatorCode: string) =>
    parts.find((p) => p.operatorCode === operatorCode)?.station ?? station;
  // 每家一份站牌，一起读取（见 lib/queries.ts 的 useBoards）；还没有 catalog 时先读本站。
  const boardStations = useMemo(
    () =>
      parts.length
        ? parts.map((p) => ({
            serverId: home.serverId,
            operatorCode: p.operatorCode,
            stationCode: p.station.code,
          }))
        : [home],
    [parts, home],
  );
  const boards = useBoards(boardStations);
  const partIndex = part ? parts.indexOf(part) : 0;
  const board = boards[partIndex] ?? boards[0]!;

  const lines = useMemo(() => hubLines(parts.map((p) => p.station)), [parts]);
  const linePatterns = gtfs.data?.linePatterns;
  // 有站序数据（GTFS 里有车次）的线路才能画列车位置；停运检修的线路没有。
  // 全线视图只列设置里显示的运营方的线路；本站的线路全被隐藏时照常全列，免得线路视图空着。
  const drawable = lines.filter((l) => linePatterns?.has(lineKey(l.operatorCode, l.lineCode)));
  const shownLines = drawable.filter((l) => shown.byCode(home.serverId, l.operatorCode));
  const orderedLines = shownLines.length > 0 ? shownLines : drawable;
  const primaryLine =
    orderedLines.find((l) => lineKey(l.operatorCode, l.lineCode) === preferredLine) ??
    orderedLines[0] ??
    lines[0];
  // 线路从它所属运营方的成员站画起（枢纽里两家的站码不保证相同）。
  const lineStation = primaryLine ? memberOf(primaryLine.operatorCode) : station;
  // 线路形状：本站所在的那一支画成主干，其余支线接在后面（见 lib/lineShape.ts）。
  const shape = useMemo(() => {
    const patterns =
      primaryLine && linePatterns?.get(lineKey(primaryLine.operatorCode, primaryLine.lineCode));
    return patterns && lineStation ? lineShape(patterns, lineStation.code) : undefined;
  }, [primaryLine, linePatterns, lineStation]);
  const strip =
    lineStation && primaryLine ? neighbourStops(catalog.data, shape, lineStation, primaryLine) : [];
  // 经车站组换乘的线路。枢纽里另一家的线路已经算本站的线路，不再列进来；
  // 那一家在设置里被隐藏时也不列（隐藏只影响显示，见 v07）。
  const transfers = parts
    .flatMap((p) => transferLines(p.station))
    .filter(
      (l, i, all) =>
        !hub?.members.some((m) => m.id === l.viaStationId) &&
        all.findIndex((x) => x.lineId === l.lineId) === i,
    );
  const nearest =
    lineStation && primaryLine && transfers.length === 0 && parts.length < 2
      ? nearestTransfer(catalog.data, shape, lineStation, primaryLine)
      : undefined;
  const timeZone = sourceTimeZone(board.data, home.serverId);
  const groupsOf = (data: RailBoard | undefined) =>
    data
      ? groupByPlatform(data.departures, {
          serverId: home.serverId,
          now,
          timeZone,
          catalog: catalog.data,
        })
      : [];
  const groups = groupsOf(board.data);
  /** 枢纽里每家的站台分组（与 parts 一一对应），车站信息用来写各站台的去向。 */
  const partGroups = parts.map((p, i) => (p === part ? groups : groupsOf(boards[i]?.data)));
  // 列车位置画的线所属那一家的站牌：对上在车上的列车（到站时刻）。
  const lineBoard =
    boards[
      Math.max(
        0,
        parts.findIndex((p) => p.station === lineStation),
      )
    ];

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
            stationCode: lineStation?.code ?? home.stationCode,
            trains: trains.data.trains,
            headsigns: gtfs.data?.headsigns ?? new Map(),
            routeStops: gtfs.data?.routeStops,
            departures: lineBoard?.data?.departures ?? [],
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
      lineStation,
      gtfs.data,
      lineBoard?.data,
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
    stationName: hub?.name ?? home.stationCode,
    /** 本站所在的枢纽（不是枢纽时只有本站一个成员）。 */
    hub,
    /** 枢纽里的各家（显示的运营方）；不止一家时站牌上方切换运营方。 */
    parts,
    /** 站牌正在看的那一家。 */
    part,
    memberOf,
    lines,
    primaryLine,
    orderedLines,
    strip,
    transfers,
    nearest,
    mapUrl: part ? blueMapUrl(part.station) : station ? blueMapUrl(station) : undefined,
    board,
    groups,
    partGroups,
    gtfs,
    trains,
    carLoads,
    lineOrder,
    lineLayout,
  };
}

export type BoardData = ReturnType<typeof useBoardData>;
