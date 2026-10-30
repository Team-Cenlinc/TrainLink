/**
 * Fetarute 铁路 API（site-api.fetarute.info/v1/rail）的类型与读取函数。
 * 字段以 Fetarute-Minecraft-API 的 docs/api/rail-api.md 为准；这里只声明界面用到的部分。
 */

/**
 * API 地址。生产环境直接请求公开域名；本地开发与 `npm run preview` 走 Vite 代理
 * （见 vite.config.ts），用同源相对路径。需要时可用环境变量 VITE_RAIL_API_BASE 覆盖。
 */
const railApiBase =
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

/** 车站在 catalog 中列出的停靠线路。 */
export interface RailStationLine {
  lineId: string;
  operatorCode: string;
  lineCode: string;
  lineName: string;
  color?: string;
}

export interface RailStation {
  id: string;
  serverId: string;
  operatorId: string;
  code: string;
  name: string;
  secondaryName?: string;
  lines: RailStationLine[];
}

export interface RailCatalog extends RailEnvelope {
  operators: RailOperator[];
  lines: RailLine[];
  stations: RailStation[];
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

/** 某个车站的站牌；API 缓存 10 秒。 */
export function fetchBoard(
  serverId: string,
  operatorCode: string,
  stationCode: string,
  signal?: AbortSignal,
): Promise<RailBoard> {
  const path = `/v1/rail/servers/${encodeURIComponent(serverId)}/stations/${encodeURIComponent(operatorCode)}/${encodeURIComponent(stationCode)}/board`;
  return getEnvelope<RailBoard>(path, ["departures"], signal);
}

/** 来源服务器的时区；缺省时用 Fetarute 服务器所在的 Asia/Shanghai。 */
export function sourceTimeZone(envelope: RailEnvelope | undefined, serverId: string): string {
  return envelope?.sources.find((s) => s.serverId === serverId)?.timezone ?? "Asia/Shanghai";
}
