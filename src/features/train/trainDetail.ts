import type { RailCatalog, RailDeparture, RailStationLine, RailTrain } from "@/lib/railApi.ts";
import type { TripUpdate } from "@/lib/realtime.ts";
import { findStation } from "@/lib/station.ts";
import { serviceTypeOf } from "@/features/board/departures.ts";
import {
  carLoad,
  loadOfRatio,
  stationOfNode,
  type CarLoad,
} from "@/features/board/linePositions.ts";

/**
 * 列车详情需要的全部信息，由在线列车、GTFS 交路站序、GTFS-RT 行程更新与本站站牌拼起来。
 * 纯函数，不涉及 React。
 */

export type StopKind = "passed" | "stop" | "here" | "end";

export interface DetailStop {
  code: string;
  name: string;
  kind: StopKind;
  /** 预计到达时刻（列车正停着的站为发车时刻），毫秒；没有实时数据时为 undefined。 */
  time?: number;
  /** 列车从这一站开出时所在的线路；跨线直通时在换乘站改变，停靠站列表据此给线段上色。 */
  line: RailStationLine;
}

export interface TrainDetail {
  name: string;
  line: RailStationLine;
  serviceType: string;
  headsign?: string;
  delayMinutes?: number;
  cars?: CarLoad[];
  /** 跨线直通的车次：按运行顺序经过的线路（至少两条）；不直通时为 undefined。 */
  through?: RailStationLine[];
  /** 这趟车不经停本站时，本站站名（例如快车通过的站、短交路到不了的站）。 */
  notStopping?: string;
  /** 当前区间：停在某站时只有 at，行驶中为 from → to。 */
  section: { at?: string; from?: string; to?: string };
  /**
   * 列车会停靠本站时，本站的信息。time 是预计到达时刻；列车已经停在本站（atStation）时是预计发车时刻。
   */
  here?: {
    stationName: string;
    time: number;
    planned?: number;
    platform?: string;
    atStation: boolean;
  };
  stops: DetailStop[];
  /** 列车位置画在 stops 的哪一项之后（停站时画在该站上）。 */
  position: { afterIndex: number; dwelling: boolean };
}

/** 停车判定：低于这个速度（方块/秒）就算停在当前站。 */
const dwellSpeed = 0.5;

/**
 * 节点两端的站：车站节点（SURC:S:PTK:1）是一个站；区间节点（SURC:PPK:RVS:2:001）是两端的站，
 * 名字不表示方向；车厂等其他节点（SURC:D:…）不算。
 */
function stationsOf(node: string | undefined): string[] {
  const parts = node?.split(":") ?? [];
  if (parts[1] === "S") return parts[2] ? [parts[2]] : [];
  if (parts[1] === "D") return [];
  return parts.slice(1, 3).filter(Boolean);
}

export function buildTrainDetail(input: {
  train: RailTrain;
  line: RailStationLine;
  serverId: string;
  homeStationCode: string;
  routeStops?: string[];
  /** 与 routeStops 一一对应，列车从每一站开出时所在的线路码。 */
  routeStopLines?: string[];
  headsign?: string;
  tripUpdate?: TripUpdate;
  departure?: RailDeparture;
  /** 车辆位置给出的各节车厢满载率。 */
  carLoads?: number[];
  catalog?: RailCatalog;
  now: number;
}): TrainDetail {
  const { train, line, serverId, catalog, tripUpdate, departure, now } = input;
  const nameOf = (code?: string) =>
    code ? (findStation(catalog, serverId, line.operatorCode, code)?.name ?? code) : undefined;

  // 物理位置：当前节点与下一节点所在的站（可能是快车通过不停的站）。
  const current = stationOfNode(train.currentNode);
  const next = stationOfNode(train.nextNode);
  const [from, to] = current
    ? [current, next ?? stationsOf(train.nextNode).find((c) => c !== current)]
    : next
      ? [stationsOf(train.currentNode).find((c) => c !== next), next]
      : stationsOf(train.currentNode);
  const stopped = train.speedBlocksPerSecond < dwellSpeed || !train.nextNode;

  // 站序：优先用交路站序；没有时用实时数据里的站。
  const order = input.routeStops ?? tripUpdate?.stops.map((s) => s.stationCode) ?? [];
  const stopTimeAt = new Map((tripUpdate?.stops ?? []).map((s) => [s.stationCode, s]));
  const last = order.length - 1;

  // 每一站开出时的线路：在这一站的 catalog 线路里找，找不到就用列车当前所在的线路。
  const lineAt = (index: number): RailStationLine => {
    const lineCode = input.routeStops ? input.routeStopLines?.[index] : undefined;
    if (!lineCode || lineCode === line.lineCode) return line;
    const station = findStation(catalog, serverId, line.operatorCode, order[index] ?? "");
    return station?.lines.find((l) => l.lineCode === lineCode && !l.viaStationCode) ?? line;
  };
  const lineSequence = order
    .map((_, index) => lineAt(index))
    .filter((l, index, all) => index === 0 || l.lineCode !== all[index - 1]?.lineCode);

  // 在停站序里的位置：停在某个停靠站上，或者在 ahead 这一站之前的区间里。
  // ahead 依次看下一节点、实时数据里第一个还没到时刻的站、当前站的下一站。
  const currentIndex = current ? order.indexOf(current) : -1;
  const dwelling = stopped && currentIndex >= 0;
  const upcoming = tripUpdate?.stops.find((s) => (s.departure ?? s.arrival ?? 0) > now);
  const aheadIndex = [
    to ? order.indexOf(to) : -1,
    upcoming ? order.indexOf(upcoming.stationCode) : -1,
    currentIndex >= 0 ? currentIndex + 1 : -1,
  ].find((i) => i > 0);
  // 最后一个已经离开的停靠站；不知道位置时为 -1，全部按未到处理。
  const lastPassed = dwelling ? currentIndex - 1 : aheadIndex ? aheadIndex - 1 : -1;

  // 只保留最后一个已过站以及之后的站，详情里不需要更早的站。
  const start = Math.max(0, lastPassed);
  const stops: DetailStop[] = order.slice(start).map((code, i) => {
    const index = start + i;
    return {
      code,
      name: nameOf(code) ?? code,
      kind:
        index <= lastPassed
          ? "passed"
          : index === last
            ? "end"
            : code === input.homeStationCode
              ? "here"
              : "stop",
      // 各站统一写到达时刻，与上方「预计到达」一致；列车正停着的那一站写发车时刻。
      time:
        dwelling && index === currentIndex
          ? (stopTimeAt.get(code)?.departure ?? stopTimeAt.get(code)?.arrival)
          : (stopTimeAt.get(code)?.arrival ?? stopTimeAt.get(code)?.departure),
      line: lineAt(index),
    };
  });

  const delaySeconds = departure?.delaySeconds ?? tripUpdate?.delaySeconds ?? 0;
  const delayMinutes = Math.floor(delaySeconds / 60);
  const atHome = dwelling && current === input.homeStationCode;
  // 本站时刻与停靠站列表里本站那一行相同；没有实时数据时用站牌的预计时刻。
  const hereTime =
    stops.find((s) => s.code === input.homeStationCode && s.kind !== "passed")?.time ??
    departure?.etaEpochMillis;
  const willStopHere = stops.some((s) => s.code === input.homeStationCode && s.kind !== "passed");

  return {
    name: train.name,
    line,
    serviceType: serviceTypeOf({ routeId: train.routeCode ?? "" }),
    headsign: input.headsign,
    delayMinutes: delayMinutes >= 1 ? delayMinutes : undefined,
    cars: input.carLoads?.map(loadOfRatio) ?? departure?.cars?.map(carLoad),
    through: lineSequence.length > 1 ? lineSequence : undefined,
    notStopping:
      order.length > 0 && !order.includes(input.homeStationCode)
        ? nameOf(input.homeStationCode)
        : undefined,
    section: dwelling ? { at: nameOf(current) } : { from: nameOf(from), to: nameOf(to) },
    here:
      willStopHere && hereTime
        ? {
            stationName: nameOf(input.homeStationCode) ?? input.homeStationCode,
            time: hereTime,
            planned: delayMinutes >= 1 ? hereTime - delaySeconds * 1000 : undefined,
            platform: departure?.platform,
            atStation: atHome,
          }
        : undefined,
    stops,
    // 停站时位置就是当前站；行驶中位置在最后一个已过站之后。不知道位置时不画。
    position: dwelling
      ? { afterIndex: currentIndex - start, dwelling }
      : { afterIndex: lastPassed >= 0 ? lastPassed - start : -1, dwelling },
  };
}
