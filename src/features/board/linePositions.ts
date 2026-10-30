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
  /** 每节车厢的拥挤程度，顺序同编组；只有出现在本站站牌上的列车才知道。 */
  cars?: CarLoad[];
  /** 晚点分钟数（≥ 1 才有）。 */
  delayMinutes?: number;
}

export interface LineLayout {
  stops: LineStop[];
  trains: LineTrain[];
}

/** 节点 SURC:S:WSD:3 → 站码 WSD；不是车站节点（例如道岔）时返回 undefined。 */
export function stationOfNode(node: string | undefined): string | undefined {
  const parts = node?.split(":");
  return parts?.[1] === "S" ? parts[2] : undefined;
}

/** 一节车厢的拥挤程度，与车站信息、列车详情里的车厢色块一致（PIDS 状态色）。 */
export type CarLoad = "low" | "medium" | "high";

/** 按在车人数占座位数的比例分三级：不到 40% 宽松，不到 75% 较多，其余拥挤。 */
export function carLoad(car: RailCar): CarLoad {
  const ratio = car.seats > 0 ? car.occupied / car.seats : 0;
  return ratio < 0.4 ? "low" : ratio < 0.75 ? "medium" : "high";
}

/** 停车判定：低于这个速度（方块/秒）且当前节点是车站，就画在车站上。 */
const dwellSpeed = 0.5;

export function buildLineLayout(input: {
  order: string[];
  line: RailStationLine;
  serverId: string;
  stationCode: string;
  trains: RailTrain[];
  headsigns: Map<string, string>;
  departures: RailDeparture[];
  catalog?: RailCatalog;
}): LineLayout {
  const { order, line, serverId, stationCode, catalog } = input;

  const stops = order.map((code) => {
    const stop = findStation(catalog, serverId, line.operatorCode, code);
    return {
      code,
      name: stop?.name ?? code,
      current: code === stationCode,
      transfers: (stop?.lines ?? []).filter((l) => l.lineCode !== line.lineCode),
    };
  });

  // 本站站牌上出现的列车，带有编组、拥挤度与晚点。
  const onBoard = new Map(input.departures.filter((d) => d.train).map((d) => [d.train!, d]));

  const trains: LineTrain[] = [];
  for (const train of input.trains) {
    if (train.serverId !== serverId || !train.inService) continue;
    if (train.operatorCode !== line.operatorCode || train.lineCode !== line.lineCode) continue;

    const from = order.indexOf(stationOfNode(train.currentNode) ?? "");
    const to = order.indexOf(stationOfNode(train.nextNode) ?? "");
    const headsign = train.routeCode ? input.headsigns.get(train.routeCode) : undefined;
    const towardsIndex = order.findIndex(
      (code) => findStation(catalog, serverId, line.operatorCode, code)?.name === headsign,
    );

    let slot: number;
    let direction: TrainDirection;
    if (from >= 0 && to >= 0 && from !== to) {
      direction = to > from ? "toEnd" : "toStart";
      slot = train.speedBlocksPerSecond < dwellSpeed ? from : (from + to) / 2;
    } else if (from >= 0) {
      // 没有下一站（多为停在终点）：停在当前站，方向按终点判断。
      slot = from;
      direction = towardsIndex >= 0 && towardsIndex < from ? "toStart" : "toEnd";
    } else if (to >= 0) {
      slot = to;
      direction = towardsIndex >= 0 && towardsIndex < to ? "toStart" : "toEnd";
    } else {
      continue; // 不在这条线的车站节点附近，无法定位。
    }

    const departure = onBoard.get(train.name);
    const delayMinutes = Math.floor((departure?.delaySeconds ?? 0) / 60);
    trains.push({
      name: train.name,
      slot,
      direction,
      serviceType: serviceTypeOf({ routeId: train.routeCode ?? "" }),
      headsign,
      cars: departure?.cars?.map(carLoad),
      delayMinutes: delayMinutes >= 1 ? delayMinutes : undefined,
    });
  }

  return { stops, trains };
}
