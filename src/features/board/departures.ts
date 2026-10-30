import type { RailCatalog, RailDeparture } from "@/lib/railApi.ts";
import { formatClock } from "@/lib/time.ts";

/**
 * 把 API 的站牌数据整理成界面需要的形状。这里只有纯函数，不涉及 React，方便单独测试。
 */

/** 界面上一行发车信息。 */
export interface DepartureView {
  key: string;
  lineCode: string;
  lineColor?: string;
  /** 种别，按 FTCA PIDS 叠放在线路色牌里。 */
  serviceType: string;
  destinationName: string;
  /** 站台号；未确定时为候选站台，例如「1/2」。 */
  platform: string;
  platformPending: boolean;
  /** 距离到站的分钟数；按 PIDS 向上取整，不足 1 分显示 1。没有 ETA 时为 null。 */
  minutes: number | null;
  /** 预计到站时刻，例如 22:20。 */
  clock: string | null;
  status: DepartureStatus;
}

/**
 * 状态词与颜色按 PIDS：晚点不足 5 分为琥珀，5 分及以上为红；计划班次为灰并加「计划」标。
 * 颜色必须与文字一起出现，不单独表达含义。
 */
export type DepartureStatus =
  | { kind: "normal" }
  | { kind: "planned" }
  | { kind: "arriving" }
  | { kind: "boarding" }
  | { kind: "cancelled" }
  | { kind: "delayed"; minutes: number; severe: boolean };

/** 同一站台的一组发车，对应看板上的「往 ×× · 站台 N」。 */
export interface PlatformGroup {
  platform: string;
  platformPending: boolean;
  /** 这一组出现过的终点名，按出现顺序去重。 */
  destinations: string[];
  departures: DepartureView[];
}

/** 整理站牌时需要的上下文。站码与线路码只在同一服务器、同一运营商内唯一，查找时必须带上它们。 */
export interface BoardContext {
  serverId: string;
  now: number;
  timeZone: string;
  catalog?: RailCatalog;
}

/**
 * 推断种别。API 目前没有单独的种别字段，暂按交路 ID 判断：带 Exp 的为快速，其余为普通。
 * 等 FTCA 下发种别后改为直接读取。
 */
export function serviceTypeOf(route: { routeId: string }): string {
  return /exp/i.test(route.routeId) ? "快速" : "普通";
}

/** 运营商代码（例如 SURC）对应的 catalog 运营商 ID。 */
function operatorIdOf(code: string | undefined, context: BoardContext): string | undefined {
  return context.catalog?.operators.find((o) => o.serverId === context.serverId && o.code === code)
    ?.id;
}

/** 从 destinationId（例如 SURC:NTA）查出乘客能看懂的站名；查不到时退回交路显示名。 */
export function destinationNameOf(departure: RailDeparture, context: BoardContext): string {
  const [operatorCode, stationCode] = departure.destinationId?.split(":") ?? [];
  const operatorId = operatorIdOf(operatorCode, context);
  const station = context.catalog?.stations.find(
    (s) => s.serverId === context.serverId && s.operatorId === operatorId && s.code === stationCode,
  );
  return station?.name ?? departure.destination;
}

/** 线路色。路线 ID 的第一段是运营商代码（例如 SURC:MT:…），用它区分不同运营商的同名线路。 */
function lineColorOf(departure: RailDeparture, context: BoardContext): string | undefined {
  const operatorId = operatorIdOf(departure.routeId.split(":")[0], context);
  return context.catalog?.lines.find(
    (l) =>
      l.serverId === context.serverId && l.operatorId === operatorId && l.code === departure.line,
  )?.color;
}

export function statusOf(departure: RailDeparture): DepartureStatus {
  switch (departure.phase) {
    case "CANCELLED":
      return { kind: "cancelled" };
    case "ARRIVING":
      return { kind: "arriving" };
    case "BOARDING":
    case "DEPARTING":
      return { kind: "boarding" };
  }
  const delayMinutes = Math.floor((departure.delaySeconds ?? 0) / 60);
  if (delayMinutes >= 1) {
    return { kind: "delayed", minutes: delayMinutes, severe: delayMinutes >= 5 };
  }
  // 计划中、或按表预测而还没有具体列车的班次，都显示为「计划」。
  if (departure.phase === "PLANNED" || departure.phase === "PENDING") return { kind: "planned" };
  if (departure.phase === "FORECAST" && !departure.train) return { kind: "planned" };
  return { kind: "normal" };
}

/** 站台号；未确定时显示候选站台，API 连站台号也没给时用「—」占位。 */
function platformOf(departure: RailDeparture): string {
  if (departure.platformPending && departure.platformCandidates?.length) {
    return departure.platformCandidates.join("/");
  }
  return departure.platform || "—";
}

export function toDepartureView(
  departure: RailDeparture,
  index: number,
  context: BoardContext,
): DepartureView {
  const eta = departure.etaEpochMillis;
  return {
    key: `${departure.routeId}-${eta ?? index}-${departure.train ?? index}`,
    lineCode: departure.line,
    lineColor: lineColorOf(departure, context),
    serviceType: serviceTypeOf(departure),
    destinationName: destinationNameOf(departure, context),
    platform: platformOf(departure),
    platformPending: departure.platformPending === true,
    minutes: eta === undefined ? null : Math.max(1, Math.ceil((eta - context.now) / 60_000)),
    clock: eta === undefined ? null : formatClock(eta, context.timeZone),
    status: statusOf(departure),
  };
}

/** 通过本站不停的班次不显示；其余按站台分组，组内保持 API 的时间顺序。 */
export function groupByPlatform(
  departures: RailDeparture[],
  context: BoardContext,
): PlatformGroup[] {
  const groups = new Map<string, PlatformGroup>();
  departures
    .filter((d) => !d.passing)
    .forEach((departure, index) => {
      const view = toDepartureView(departure, index, context);
      const group = groups.get(view.platform) ?? {
        platform: view.platform,
        platformPending: view.platformPending,
        destinations: [],
        departures: [],
      };
      if (!group.destinations.includes(view.destinationName)) {
        group.destinations.push(view.destinationName);
      }
      group.departures.push(view);
      groups.set(view.platform, group);
    });
  return [...groups.values()].sort((a, b) =>
    a.platform.localeCompare(b.platform, "zh-Hans", { numeric: true }),
  );
}
