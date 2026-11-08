/**
 * Fetarute 铁路 API（site-api.fetarute.info/v1/rail）的类型与读取函数。
 * 字段以 Fetarute-Minecraft-API 的 docs/api/rail-api.md 为准；这里只声明界面用到的部分。
 */

/**
 * API 地址。生产环境直接请求公开域名；本地开发与 `npm run preview` 走 Vite 代理
 * （见 vite.config.ts），用同源相对路径。需要时可用环境变量 VITE_RAIL_API_BASE 覆盖。
 */
export const railApiBase: string =
  import.meta.env.VITE_RAIL_API_BASE ??
  (import.meta.env.DEV ? "" : "https://site-api.fetarute.info");

/** 一个来源服务器的读取状态；fresh 时带服务器时区，用来显示时刻。 */
export interface RailSource {
  serverId: string;
  state: "fresh" | "unavailable" | "incompatible";
  timezone?: string;
}

/** 所有聚合响应共有的外层字段。 */
export interface RailEnvelope {
  schemaVersion: 1;
  generatedAt: string;
  /** healthy：所有来源都可用；partial：部分来源失败，数据可能不完整。 */
  state: "healthy" | "partial";
  sources: RailSource[];
}

export interface RailOperator {
  id: string;
  serverId: string;
  code: string;
  name: string;
  /** 简称（例如「都会交通」），用在分段控件和一行文字里；API 还没有时用 name。 */
  shortName?: string;
}

export interface RailLine {
  id: string;
  serverId: string;
  operatorId: string;
  code: string;
  name: string;
  secondaryName?: string;
  /** 线路色，例如 #D920D9。缺省时界面退回中性深色。 */
  color?: string;
  serviceType: string;
  status: string;
}

/**
 * 车站在 catalog 中列出的线路。
 * 本站停靠的线路没有 viaStationCode；经车站组换乘的线路带 viaStationCode（例如河滨道经浦汇换乘海岛线）。
 */
export interface RailStationLine {
  lineId: string;
  operatorCode: string;
  lineCode: string;
  lineName: string;
  color?: string;
  viaStationId?: string;
  viaStationCode?: string;
  /** IN_STATION：站内换乘；OUT_OF_STATION：出站换乘。 */
  transferType?: string;
  walkSeconds?: number;
}

export interface RailStation {
  id: string;
  serverId: string;
  operatorId: string;
  code: string;
  name: string;
  secondaryName?: string;
  /** 车站所在的 Minecraft 世界，例如 Towny。 */
  world?: string;
  position?: { x: number; y: number; z: number };
  lines: RailStationLine[];
}

/** 车站组的一个成员。transferType 按成员标：IN_STATION 的成员合成一个枢纽（见 lib/hubs.ts）。 */
export interface RailStationGroupMember {
  stationId: string;
  operatorCode: string;
  stationCode: string;
  stationName: string;
  /** IN_STATION：站内换乘；OUT_OF_STATION：出站换乘。 */
  transferType?: string;
  walkSeconds?: number;
}

/** 车站组：例如海侧约翰枢纽（SURC:JBS + PUAT:JBS）、河滨道-浦汇虚拟换乘。 */
export interface RailStationGroup {
  id: string;
  serverId: string;
  code: string;
  name: string;
  secondaryName?: string;
  members: RailStationGroupMember[];
}

export interface RailCatalog extends RailEnvelope {
  operators: RailOperator[];
  lines: RailLine[];
  stations: RailStation[];
  /** 旧版 API 没有。 */
  stationGroups?: RailStationGroup[];
}

/** 一节车厢的座位数与在车人数，用于计算拥挤度。 */
export interface RailCar {
  seats: number;
  occupied: number;
}

/**
 * 站牌上的一班列车。
 * phase 取自 FTCA：PLANNED / PENDING / FORECAST 为计划或按表预测，EN_ROUTE 为运行中，
 * ARRIVING 为进站，BOARDING 为停靠中，DEPARTING 为即将离站，CANCELLED 为取消。
 */
export interface RailDeparture {
  line: string;
  routeId: string;
  /** 交路显示名，例如「两港快线-蒲发」；乘客看的终点名请用 destinationId 查 catalog。 */
  destination: string;
  /** 来源内的终点引用，格式为「运营商:站码」，例如 SURC:NTA。 */
  destinationId?: string;
  platform: string;
  /** 站台尚未确定；此时 platformCandidates 一定非空。 */
  platformPending?: boolean;
  platformCandidates?: string[];
  status: string;
  phase: string;
  eta?: string;
  etaEpochMillis?: number;
  /** 晚点秒数；负数表示早点。 */
  delaySeconds?: number;
  passing: boolean;
  terminating: boolean;
  inService: boolean;
  /** 列车名；只有已经出车的班次才有。 */
  train?: string;
  cars?: RailCar[];
}

export interface RailBoard extends RailEnvelope {
  serverId: string;
  operatorCode: string;
  stationCode: string;
  departures: RailDeparture[];
}

/**
 * 一列在线列车。节点形如 SURC:S:WSD:3（运营商:S:站码:站台）；
 * currentNode 是最近经过或正停靠的节点，nextNode 是下一个节点（到终点后可能没有）。
 */
export interface RailTrain {
  serverId: string;
  /** 列车名，例如 SURC-MT-LP-8538；同一服务器内唯一。 */
  name: string;
  operatorCode: string;
  lineCode: string;
  /** 交路，例如 SURC:MT:MT-2F_Short；用它在 GTFS 里查终点。 */
  routeCode?: string;
  inService: boolean;
  currentNode?: string;
  nextNode?: string;
  speedBlocksPerSecond: number;
  updatedAt: string;
}

export interface RailTrains extends RailEnvelope {
  trains: RailTrain[];
}

/** 请求失败时抛出，带上 HTTP 状态码，方便界面区分「暂时不可用」(503) 与其他错误。 */
export class RailApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RailApiError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * 读取并校验响应外层：HTTP 状态、schemaVersion，以及调用方要求必须是数组的字段。
 * 不逐项校验每个对象，只拦住会让界面整体出错的情况（例如 API 升级了 schemaVersion）。
 */
async function getEnvelope<T extends RailEnvelope>(
  path: string,
  arrayFields: string[],
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${railApiBase}${path}`, { signal });
  if (!response.ok) {
    throw new RailApiError(response.status, `铁路 API 返回 ${response.status}：${path}`);
  }
  const body: unknown = await response.json();
  if (
    !isRecord(body) ||
    body.schemaVersion !== 1 ||
    !Array.isArray(body.sources) ||
    arrayFields.some((field) => !Array.isArray(body[field]))
  ) {
    throw new RailApiError(response.status, `铁路 API 响应格式不符：${path}`);
  }
  return body as T;
}

/** 运营商、线路、车站目录；变化很慢，API 缓存 60 秒。 */
export function fetchCatalog(signal?: AbortSignal): Promise<RailCatalog> {
  return getEnvelope<RailCatalog>("/v1/rail/catalog", ["operators", "lines", "stations"], signal);
}

/**
 * 某个车站的站牌；API 缓存 10 秒。
 * horizonSeconds 为可选的向后看时间范围，必须是 300 的整数倍，否则 API 会 308 重定向
 * （重定向到绝对地址会绕过本地代理而被 CORS 拦下）。省略时用 API 默认范围。
 */
export function fetchBoard(
  serverId: string,
  operatorCode: string,
  stationCode: string,
  options: { horizonSeconds?: number; signal?: AbortSignal } = {},
): Promise<RailBoard> {
  const query = options.horizonSeconds ? `?horizon=${options.horizonSeconds}` : "";
  const path = `/v1/rail/servers/${encodeURIComponent(serverId)}/stations/${encodeURIComponent(operatorCode)}/${encodeURIComponent(stationCode)}/board${query}`;
  return getEnvelope<RailBoard>(path, ["departures"], options.signal);
}

/** 所有在线列车；API 缓存 5 秒。 */
export function fetchTrains(signal?: AbortSignal): Promise<RailTrains> {
  return getEnvelope<RailTrains>("/v1/rail/trains", ["trains"], signal);
}

/** 来源服务器的时区；缺省时用 Fetarute 服务器所在的 Asia/Shanghai。 */
export function sourceTimeZone(envelope: RailEnvelope | undefined, serverId: string): string {
  return envelope?.sources.find((s) => s.serverId === serverId)?.timezone ?? "Asia/Shanghai";
}
