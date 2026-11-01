import type {
  RailCatalog,
  RailCar,
  RailDeparture,
  RailStationLine,
  RailTrain,
} from "@/lib/railApi.ts";
import { findStation } from "@/lib/station.ts";
import { serviceTypeOf } from "./departures.ts";

/**
 * 单线列车位置：把在线列车放到线路上。纯函数，不涉及 React。
 * 站序来自 GTFS（见 lib/gtfs.ts）；列车位置来自 /v1/rail/trains 的当前节点与下一节点。
 */

export interface LineStop {
  code: string;
  name: string;
  /** 是否本站。 */
  current: boolean;
  /** 在这一站可换乘的其他线路。 */
  transfers: RailStationLine[];
}

/** toStart：往站序第一站方向；toEnd：往站序最后一站方向。 */
export type TrainDirection = "toStart" | "toEnd";

export interface LineTrain {
  name: string;
  /** 在线路上的位置：整数为停在第 n 站，x.5 为在两站之间。 */
  slot: number;
  direction: TrainDirection;
  serviceType: string;
  headsign?: string;
  /** 每节车厢的拥挤程度，顺序同编组；来自车辆位置，没有时用本站站牌的数据。 */
  cars?: CarLoad[];
  /** 晚点分钟数（≥ 1 才有）。 */
  delayMinutes?: number;
}

export interface LineLayout {
  stops: LineStop[];
  trains: LineTrain[];
}

/** 节点 SURC:S:WSD:3 → 站码 WSD；不是车站节点（例如区间、车厂）时返回 undefined。 */
export function stationOfNode(node: string | undefined): string | undefined {
  const parts = node?.split(":");
  return parts?.[1] === "S" ? parts[2] : undefined;
}

/**
 * 节点两端的站：车站节点（SURC:S:PTK:1）是一个站；区间节点（SURC:PPK:RVS:2:001）是两端的站，
 * 名字不表示方向；车厂等其他节点（SURC:D:…）不算。
 */
export function stationsOfNode(node: string | undefined): string[] {
  const parts = node?.split(":") ?? [];
  if (parts[1] === "S") return parts[2] ? [parts[2]] : [];
  if (parts[1] === "D") return [];
  return parts.slice(1, 3).filter(Boolean);
}

/**
 * 列车所在的物理区间，看板线路图与列车详情共用：
 * from 是正停着或刚经过的站，to 是前方的站（都可能是快车通过不停的站）；
 * current 只在当前节点是车站节点时才有。
 * 两个节点都是区间节点时，节点名不表示方向：下一节点换到了相邻区间，就以两个区间共有的站为前方；
 * 仍在同一区间里时按交路站序 routeOrder 判断先后，判断不了时按节点里的顺序。
 */
export function trainSection(
  train: Pick<RailTrain, "currentNode" | "nextNode">,
  routeOrder: string[] = [],
): { current?: string; from?: string; to?: string } {
  const current = stationOfNode(train.currentNode);
  const next = stationOfNode(train.nextNode);
  if (current) {
    return {
      current,
      from: current,
      to: next ?? stationsOfNode(train.nextNode).find((c) => c !== current),
    };
  }
  const here = stationsOfNode(train.currentNode);
  if (next) return { from: here.find((c) => c !== next), to: next };
  const [a, b] = here;
  const ahead = stationsOfNode(train.nextNode);
  const shared = here.find((c) => ahead.includes(c));
  if (shared && ahead.some((c) => !here.includes(c))) {
    return { from: here.find((c) => c !== shared), to: shared };
  }
  const ia = routeOrder.indexOf(a ?? "");
  const ib = routeOrder.indexOf(b ?? "");
  return ia >= 0 && ib >= 0 && ib < ia ? { from: b, to: a } : { from: a, to: b };
}

/** 一节车厢的拥挤程度，与车站信息、列车详情里的车厢色块一致（PIDS 状态色）。 */
export type CarLoad = "low" | "medium" | "high";

/** 按在车人数占座位数的比例分三级：不到 40% 宽松，不到 75% 较多，其余拥挤。 */
export function loadOfRatio(ratio: number): CarLoad {
  return ratio < 0.4 ? "low" : ratio < 0.75 ? "medium" : "high";
}

/** 站牌里的一节车厢（人数与座位数）→ 拥挤程度。 */
export function carLoad(car: RailCar): CarLoad {
  return loadOfRatio(car.seats > 0 ? car.occupied / car.seats : 0);
}

/** 停车判定：低于这个速度（方块/秒），或者没有下一节点。 */
const dwellSpeed = 0.5;

/** 列车停着（看板线路图、列车详情、乘车 GO 共用）：停在车站节点上时，配合 stationOfNode 就是停在哪站。 */
export function isStopped(train: Pick<RailTrain, "speedBlocksPerSecond" | "nextNode">): boolean {
  return train.speedBlocksPerSecond < dwellSpeed || !train.nextNode;
}

/** 交路沿这条线的运行方向：取交路里相邻两个在这条线上的站比较先后；看不出时为 undefined。 */
function routeDirection(routeStops: string[] | undefined, order: string[]) {
  const indexes = (routeStops ?? []).map((code) => order.indexOf(code)).filter((i) => i >= 0);
  for (let i = 1; i < indexes.length; i++) {
    if (indexes[i] !== indexes[i - 1]) return indexes[i]! > indexes[i - 1]! ? "toEnd" : "toStart";
  }
  return undefined;
}

/**
 * 一列车在线路图上的位置与方向，与列车详情（features/train/trainDetail.ts）用同一个物理区间（trainSection）：
 * - 停着、且当前站是这趟车的停靠站（快车在不停的站上停下等信号不算），画在这一站；
 * - 其余画在 from 与 to 之间；两站不相邻（快车走越行线）而中点正好落在车站上时，往前方挪半格，
 *   免得画成停在不停的站上；只知道一端时画在那一站与相邻站之间。
 * 方向依次看区间两端、交路站序、终点站名；都看不出时默认往最后一站方向。
 */
export function placeTrain(input: {
  train: RailTrain;
  order: string[];
  /** 这趟车交路的停靠站序（可能包含直通的另一条线上的站）。 */
  routeStops?: string[];
  headsign?: string;
  /** 与 order 一一对应的站名，用来按终点站名判断方向。 */
  stopNames: string[];
}): { slot: number; direction: TrainDirection } | undefined {
  const { train, order, routeStops, headsign, stopNames } = input;
  const { current, from, to } = trainSection(train, routeStops);
  const fromIndex = from ? order.indexOf(from) : -1;
  const toIndex = to ? order.indexOf(to) : -1;
  const currentIndex = current ? order.indexOf(current) : -1;
  if (fromIndex < 0 && toIndex < 0) return undefined; // 不在这条线的车站附近，无法定位。

  // 没有终点（headsign 为 undefined）时不能拿它去比，否则会和 catalog 里查不到的站名（同样是 undefined）相等。
  const towardsIndex = headsign === undefined ? -1 : stopNames.indexOf(headsign);
  const known = fromIndex >= 0 ? fromIndex : toIndex;
  const direction: TrainDirection =
    fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex
      ? toIndex > fromIndex
        ? "toEnd"
        : "toStart"
      : (routeDirection(routeStops, order) ??
        (towardsIndex >= 0 && towardsIndex < known ? "toStart" : "toEnd"));
  const step = direction === "toEnd" ? 1 : -1;

  const stopped = isStopped(train);
  const servesCurrent = !routeStops || (current !== undefined && routeStops.includes(current));
  if (stopped && currentIndex >= 0 && servesCurrent) return { slot: currentIndex, direction };

  const last = order.length - 1;
  // 只知道一端：刚开出（from）就在它前方半格，快到站（to）就在它后方半格；到了线路尽头就画在端点站上。
  const half = (index: number, sign: number) => Math.min(Math.max(index + sign * 0.5, 0), last);
  let slot: number;
  if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
    const middle = (fromIndex + toIndex) / 2;
    slot = Number.isInteger(middle) ? middle + step * 0.5 : middle;
  } else if (fromIndex >= 0) {
    slot = half(fromIndex, step);
  } else {
    slot = half(toIndex, -step);
  }
  return { slot, direction };
}

export function buildLineLayout(input: {
  order: string[];
  line: RailStationLine;
  serverId: string;
  stationCode: string;
  trains: RailTrain[];
  headsigns: Map<string, string>;
  /** 各交路的停靠站序（GTFS），以交路代码索引；用来判断方向、快车是否停靠。 */
  routeStops?: Map<string, string[]>;
  departures: RailDeparture[];
  /** 车辆位置给出的各节车厢满载率，以列车名索引。 */
  carLoads?: Map<string, number[]>;
  catalog?: RailCatalog;
}): LineLayout {
  const { order, line, serverId, stationCode, catalog } = input;

  // 每站只在 catalog 里查一次，后面按站名判断方向时直接用这里的名字。
  const stations = order.map((code) => findStation(catalog, serverId, line.operatorCode, code));
  const stops = order.map((code, i) => ({
    code,
    name: stations[i]?.name ?? code,
    current: code === stationCode,
    transfers: (stations[i]?.lines ?? []).filter((l) => l.lineCode !== line.lineCode),
  }));
  // 查不到的站用空字符串：不会等于任何终点站名。
  const stopNames = stations.map((s) => s?.name ?? "");

  // 本站站牌上出现的列车，带有编组、拥挤度与晚点。
  const onBoard = new Map(input.departures.filter((d) => d.train).map((d) => [d.train!, d]));

  const trains: LineTrain[] = [];
  for (const train of input.trains) {
    if (train.serverId !== serverId || !train.inService) continue;
    if (train.operatorCode !== line.operatorCode || train.lineCode !== line.lineCode) continue;

    const headsign = train.routeCode ? input.headsigns.get(train.routeCode) : undefined;
    const place = placeTrain({
      train,
      order,
      routeStops: train.routeCode ? input.routeStops?.get(train.routeCode) : undefined,
      headsign,
      stopNames,
    });
    if (!place) continue;

    const departure = onBoard.get(train.name);
    const delayMinutes = Math.floor((departure?.delaySeconds ?? 0) / 60);
    trains.push({
      name: train.name,
      ...place,
      serviceType: serviceTypeOf({ routeId: train.routeCode ?? "" }),
      headsign,
      cars: input.carLoads?.get(train.name)?.map(loadOfRatio) ?? departure?.cars?.map(carLoad),
      delayMinutes: delayMinutes >= 1 ? delayMinutes : undefined,
    });
  }

  return { stops, trains };
}
