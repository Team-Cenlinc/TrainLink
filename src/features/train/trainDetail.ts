import type { RailCatalog, RailDeparture, RailStationLine, RailTrain } from "@/lib/railApi.ts";
import type { TripUpdate } from "@/lib/realtime.ts";
import { findStation } from "@/lib/station.ts";
import { serviceTypeOf } from "@/features/board/departures.ts";
import { carLoad, stationOfNode, type CarLoad } from "@/features/board/linePositions.ts";

/**
 * 列车详情需要的全部信息，由在线列车、GTFS 交路站序、GTFS-RT 行程更新与本站站牌拼起来。
 * 纯函数，不涉及 React。
 */

export type StopKind = "passed" | "stop" | "here" | "end";

export interface DetailStop {
  code: string;
  name: string;
  kind: StopKind;
  /** 预计到达（终点）或发车时刻，毫秒；没有实时数据时为 undefined。 */
  time?: number;
}

export interface TrainDetail {
  name: string;
  line: RailStationLine;
  serviceType: string;
  headsign?: string;
  delayMinutes?: number;
  cars?: CarLoad[];
  /** 当前区间：停在某站时只有 at，行驶中为 from → to。 */
  section: { at?: string; from?: string; to?: string };
  /** 列车会停靠本站时，本站的到站信息。 */
  here?: { stationName: string; time: number; planned?: number; platform?: string };
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
  headsign?: string;
  tripUpdate?: TripUpdate;
  departure?: RailDeparture;
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
  const timeAt = new Map(
    (tripUpdate?.stops ?? []).map((s) => [s.stationCode, s.departure ?? s.arrival]),
  );
  const last = order.length - 1;

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
      // 终点只有到达时刻；其余站用发车时刻（到站即停，乘客关心何时能上车）。
      time:
        index === last
          ? tripUpdate?.stops.find((s) => s.stationCode === code)?.arrival
          : timeAt.get(code),
    };
  });

  const delaySeconds = departure?.delaySeconds ?? tripUpdate?.delaySeconds ?? 0;
  const delayMinutes = Math.floor(delaySeconds / 60);
  const hereTime = timeAt.get(input.homeStationCode) ?? departure?.etaEpochMillis;
  const willStopHere = stops.some((s) => s.code === input.homeStationCode && s.kind !== "passed");

  return {
    name: train.name,
    line,
    serviceType: serviceTypeOf({ routeId: train.routeCode ?? "" }),
    headsign: input.headsign,
    delayMinutes: delayMinutes >= 1 ? delayMinutes : undefined,
    cars: departure?.cars?.map(carLoad),
    section: dwelling ? { at: nameOf(current) } : { from: nameOf(from), to: nameOf(to) },
    here:
      willStopHere && hereTime
        ? {
            stationName: nameOf(input.homeStationCode) ?? input.homeStationCode,
            time: hereTime,
            planned: delayMinutes >= 1 ? hereTime - delaySeconds * 1000 : undefined,
            platform: departure?.platform,
          }
        : undefined,
    stops,
    // 停站时位置就是当前站；行驶中位置在最后一个已过站之后。不知道位置时不画。
    position: dwelling
      ? { afterIndex: currentIndex - start, dwelling }
      : { afterIndex: lastPassed >= 0 ? lastPassed - start : -1, dwelling },
  };
}
