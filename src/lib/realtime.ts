import { stopRef } from "./gtfs.ts";
import { railApiBase } from "./railApi.ts";

/**
 * GTFS-Realtime 实时数据：
 * - 行程更新（trip-updates）：每列车接下来各站的预计到发时刻与晚点；
 * - 车辆位置（vehicle-positions）：每列车每节车厢的满载率；
 * - 通告（alerts）：线路停运、班次取消等状态，以及运营方发布的公告。
 * 数据是 protobuf 二进制；解码库只在第一次需要时加载（动态 import），不增加首屏体积。
 */

/** 一列车在某一站的预计时刻（毫秒时间戳）。 */
export interface StopTime {
  stationCode: string;
  arrival?: number;
  departure?: number;
}

export interface TripUpdate {
  /** 列车名，与 /v1/rail/trains 的 name 相同，例如 SURC-MT-LP-0144。 */
  trainName: string;
  tripId: string;
  /** 整个车次的晚点秒数。 */
  delaySeconds?: number;
  /** 当前所在（或刚离开）的站与接下来要停的站，按站序。 */
  stops: StopTime[];
}

/** protobuf 的 64 位整数可能解成 Long 对象，统一转成 number。 */
type LongLike = number | { toNumber(): number } | null | undefined;
const toNumber = (value: LongLike): number | undefined => {
  if (value == null) return undefined;
  return typeof value === "number" ? value : value.toNumber();
};

/** stop_id 形如 survival:SURC:S:PTK:1，取出站码 PTK。 */
const stationOfStop = (stopId: string | null | undefined) => stopId?.split(":S:")[1]?.split(":")[0];

/** GTFS-RT 解码库，只在第一次需要时加载。 */
async function loadRealtime() {
  const bindings = await import("gtfs-realtime-bindings");
  // 这个库是 CommonJS，打包后命名导出可能挂在 default 上。
  return (
    bindings.transit_realtime ??
    (bindings as unknown as { default: typeof bindings }).default.transit_realtime
  );
}

/** 解码一份 GTFS-RT 二进制数据。 */
async function decodeFeed(bytes: Uint8Array) {
  return (await loadRealtime()).FeedMessage.decode(bytes);
}

/** 读取某服务器的一个 GTFS-RT 数据源（trip-updates、vehicle-positions 或 alerts）的二进制内容。 */
async function fetchFeedBytes(serverId: string, feedName: string, signal?: AbortSignal) {
  const response = await fetch(
    `${railApiBase}/v1/rail/servers/${encodeURIComponent(serverId)}/gtfs-rt/${feedName}`,
    { signal },
  );
  if (!response.ok) throw new Error(`实时数据 ${feedName} 读取失败：${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** 读取并解码某服务器的一个 GTFS-RT 数据源。 */
async function fetchFeed(serverId: string, feedName: string, signal?: AbortSignal) {
  return decodeFeed(await fetchFeedBytes(serverId, feedName, signal));
}

/** 一条运营通告：系统生成的线路状态（停运、班次取消），或运营方发布的公告。 */
export interface ServiceAlert {
  id: string;
  title: string;
  body?: string;
  /** 涉及的线路（运营方码 + 线路码；不同运营方可能用同一个线路码）；为空表示全网通告。 */
  lines: AlertLine[];
  /** 对运营的影响：停运、班次减少，或其他（公告、未说明）。 */
  effect: AlertEffect;
  /** 生效时段（毫秒）；没有时段表示一直生效，start / end 缺省表示不限。 */
  activePeriods?: { start?: number; end?: number }[];
}

export type AlertEffect = "noService" | "reducedService" | "other";

/** 通告涉及的一条线路。 */
export interface AlertLine {
  operatorCode: string;
  lineCode: string;
}

type Translated = { translation?: { text?: string | null; language?: string | null }[] | null };

/** 多语言文字取中文（language 以 zh 开头），没有中文时取第一种。 */
function chineseText(value: Translated | null | undefined): string | undefined {
  const translations = value?.translation ?? [];
  const zh = translations.find((t) => t.language?.startsWith("zh"));
  return (zh ?? translations[0])?.text ?? undefined;
}

/**
 * 通告涉及的线路。route_id 形如 survival:SURC:DS，取出运营方 SURC 与线路码 DS；
 * 同一条线路可能被提到几次（例如分方向各列一次），只记一次。
 */
function linesOf(entities: { routeId?: string | null }[]): AlertLine[] {
  const lines = new Map<string, AlertLine>();
  for (const { routeId } of entities) {
    const [, operatorCode, lineCode] = routeId?.split(":") ?? [];
    if (operatorCode && lineCode)
      lines.set(`${operatorCode}:${lineCode}`, { operatorCode, lineCode });
  }
  return [...lines.values()];
}

/** 解码通告数据源。 */
export async function decodeAlerts(bytes: Uint8Array): Promise<ServiceAlert[]> {
  const realtime = await loadRealtime();
  const feed = realtime.FeedMessage.decode(bytes);
  const { Effect } = realtime.Alert;
  const effectOf = (effect: number | null | undefined): AlertEffect =>
    effect === Effect.NO_SERVICE
      ? "noService"
      : effect === Effect.REDUCED_SERVICE
        ? "reducedService"
        : "other";
  // 时段的 start / end 是秒；0 或缺省表示不限。
  const msOf = (value: LongLike) => {
    const seconds = toNumber(value);
    return seconds ? seconds * 1000 : undefined;
  };
  return feed.entity.flatMap((entity) => {
    const alert = entity.alert;
    if (!alert) return [];
    return [
      {
        id: entity.id,
        title: chineseText(alert.headerText) ?? "",
        body: chineseText(alert.descriptionText),
        lines: linesOf(alert.informedEntity ?? []),
        effect: effectOf(alert.effect),
        activePeriods: (alert.activePeriod ?? []).map((p) => ({
          start: msOf(p.start as LongLike),
          end: msOf(p.end as LongLike),
        })),
      },
    ];
  });
}

/**
 * 每列车各节车厢的满载率（在车人数 / 座位数，0–1，可能超过 1），按车厢顺序，以列车名索引。
 * 车站站牌只给出会停靠本站、且已经排定列车的班次的车厢数据；车辆位置覆盖线上所有列车。
 */
export async function fetchCarLoads(
  serverId: string,
  signal?: AbortSignal,
): Promise<Map<string, number[]>> {
  const feed = await fetchFeed(serverId, "vehicle-positions", signal);
  const byTrain = new Map<string, number[]>();
  for (const entity of feed.entity) {
    const trainName = entity.vehicle?.vehicle?.id;
    const carriages = entity.vehicle?.multiCarriageDetails;
    if (!trainName || !carriages?.length) continue;
    byTrain.set(
      trainName,
      [...carriages]
        .sort((a, b) => (a.carriageSequence ?? 0) - (b.carriageSequence ?? 0))
        .map((c) => (c.occupancyPercentage ?? 0) / 100),
    );
  }
  return byTrain;
}

/** 读取某服务器当前的运营通告。 */
export async function fetchAlerts(serverId: string, signal?: AbortSignal) {
  return decodeAlerts(await fetchFeedBytes(serverId, "alerts", signal));
}

/** 一个车次（GTFS trip_id）的实时情况，用于行程规划。 */
export interface TripRealtime {
  /** 整个车次已取消。 */
  cancelled: boolean;
  delaySeconds?: number;
  /** 跑这个车次的列车名（对上在线列车的位置）。 */
  trainName?: string;
  /** 临时加开等本来就不在 GTFS 时刻表里的车次（ADDED、UNSCHEDULED、DUPLICATED、NEW）。 */
  unlisted?: true;
  /** 各站预计到发时刻（毫秒），以车站 key（运营方:站码）索引。 */
  stops: Map<string, { arrival?: number; departure?: number }>;
}

/** 一份行程更新的两种索引：按列车名（列车详情、运行状态用）与按车次（行程规划用）。 */
export interface TripFeed {
  byTrain: Map<string, TripUpdate>;
  /** 取消的车次也在里面（它们没有列车）。 */
  byTrip: Map<string, TripRealtime>;
}

/** 一列车某个车次的一段更新（跨线直通的车次按线路拆成几段）。 */
interface TripLeg {
  tripId: string;
  /** 段号：基础车次号是第 1 段，后缀 ~2、~3… 是后面几段。 */
  leg: number;
  /** 开行日期与时刻（GTFS 的 start_date + start_time），用来比较哪个车次先开。 */
  start?: string;
  delaySeconds?: number;
  stops: StopTime[];
}

/** 直通车次的分段后缀：MT-3N_DPExp-081~2 是 MT-3N_DPExp-081 的第 2 段。 */
const legSuffix = /~(\d+)$/;

/** 去掉分段后缀的车次号，同一车次的各段相同。 */
const baseTripId = (tripId: string) => tripId.replace(legSuffix, "");

/** 一个车次各站已知的预计时刻（毫秒）。 */
const timesOf = (legs: TripLeg[]) =>
  legs.flatMap((l) =>
    l.stops.flatMap((s) => [s.arrival, s.departure]).filter((t): t is number => t !== undefined),
  );

/** 一个车次最早的一个预计时刻；没有时刻时为 undefined。 */
const firstTime = (legs: TripLeg[]) => {
  const times = timesOf(legs);
  return times.length > 0 ? Math.min(...times) : undefined;
};

/** 一个车次最晚的一个预计时刻；没有时刻时为 undefined。 */
const lastTime = (legs: TripLeg[]) => {
  const times = timesOf(legs);
  return times.length > 0 ? Math.max(...times) : undefined;
};

/** 车次的开行日期时刻：各段里最早的那个（时刻已补齐成 8 位，按字符串比较即可，25:10:00 这样的跨日时刻也对）。 */
const startOf = (legs: TripLeg[]) =>
  legs
    .map((l) => l.start)
    .filter((s): s is string => s !== undefined)
    .sort()[0];

/**
 * 一列车可能同时带着几个车次：正在跑的车次，以及折返后接着跑的下一个车次。
 * 列车详情与运行状态只要当前车次：先去掉所有站都已过去的车次，再取开行最早的
 * （有开行日期时刻就比它，没有就比最早的预计时刻）。
 */
function currentTrip(trips: TripLeg[][], feedTime: number | undefined): TripLeg[] {
  const pending = trips.filter((legs) => {
    const last = lastTime(legs);
    return feedTime === undefined || last === undefined || last >= feedTime;
  });
  const candidates = pending.length > 0 ? pending : trips;
  return [...candidates].sort((a, b) => {
    const [startA, startB] = [startOf(a), startOf(b)];
    if (startA !== undefined && startB !== undefined && startA !== startB) {
      return startA < startB ? -1 : 1;
    }
    return (firstTime(a) ?? Infinity) - (firstTime(b) ?? Infinity);
  })[0]!;
}

/**
 * 把一个车次的各段按段号接成一条；换乘站在前一段是终点（只有到达）、在后一段是起点，合并成一站。
 */
function joinLegs(trainName: string, legs: TripLeg[]): TripUpdate {
  const [first, ...rest] = [...legs].sort((a, b) => a.leg - b.leg);
  const stops = first!.stops.map((s) => ({ ...s }));
  for (const leg of rest) {
    const junction = stops.at(-1);
    const [head, ...tail] = leg.stops;
    if (junction && head?.stationCode === junction.stationCode) {
      junction.departure = head.departure ?? junction.departure;
      stops.push(...tail.map((s) => ({ ...s })));
    } else {
      stops.push(...leg.stops.map((s) => ({ ...s })));
    }
  }
  return { trainName, tripId: first!.tripId, delaySeconds: first!.delaySeconds, stops };
}

/**
 * 解码行程更新，一次生成两种索引。几个页面共用同一份数据（见 lib/queries.ts 的 useTripFeed），
 * 不再各自下载一遍。
 */
export async function decodeTripFeed(bytes: Uint8Array): Promise<TripFeed> {
  const realtime = await loadRealtime();
  const feed = realtime.FeedMessage.decode(bytes);
  const { CANCELED, ADDED, UNSCHEDULED, DUPLICATED, NEW } =
    realtime.TripDescriptor.ScheduleRelationship;
  const unlisted = new Set<number>([ADDED, UNSCHEDULED, DUPLICATED, NEW]);
  const byTrip = new Map<string, TripRealtime>();
  /** 每列车的各个车次（以去掉分段后缀的车次号区分）及其各段。 */
  const tripsOfTrain = new Map<string, Map<string, TripLeg[]>>();

  for (const entity of feed.entity) {
    const update = entity.tripUpdate;
    if (!update) continue;
    // 列车详情按站码；行程规划与乘车 GO 按车站 key（运营方:站码）对上时刻表。
    const keyed = (update.stopTimeUpdate ?? [])
      .map((s) => {
        const arrival = toNumber(s.arrival?.time as LongLike);
        const departure = toNumber(s.departure?.time as LongLike);
        const stop: StopTime = {
          stationCode: stationOfStop(s.stopId) ?? "",
          // 0 表示没有这个时刻（例如终点站没有发车时刻）。
          arrival: arrival ? arrival * 1000 : undefined,
          departure: departure ? departure * 1000 : undefined,
        };
        return { stop, station: s.stopId ? stopRef(s.stopId).station : "" };
      })
      .filter((s) => s.stop.stationCode);
    const stops = keyed.map((s) => s.stop);

    const tripId = update.trip.tripId;
    if (tripId) {
      byTrip.set(tripId, {
        cancelled: update.trip.scheduleRelationship === CANCELED,
        delaySeconds: update.delay ?? undefined,
        trainName: update.vehicle?.id ?? undefined,
        ...(unlisted.has(update.trip.scheduleRelationship ?? 0) && { unlisted: true as const }),
        stops: new Map(
          keyed.map(({ stop, station }) => [
            station,
            { arrival: stop.arrival, departure: stop.departure },
          ]),
        ),
      });
    }

    const trainName = update.vehicle?.id;
    if (!trainName) continue;
    const id = tripId ?? "";
    const { startDate, startTime } = update.trip;
    const leg: TripLeg = {
      tripId: id,
      leg: Number(legSuffix.exec(id)?.[1] ?? 1),
      start:
        startDate || startTime
          ? `${startDate ?? ""} ${(startTime ?? "").padStart(8, "0")}`
          : undefined,
      delaySeconds: update.delay ?? undefined,
      stops,
    };
    const trips = tripsOfTrain.get(trainName) ?? new Map<string, TripLeg[]>();
    tripsOfTrain.set(trainName, trips);
    const base = baseTripId(id);
    trips.set(base, [...(trips.get(base) ?? []), leg]);
  }

  const feedSeconds = toNumber(feed.header?.timestamp as LongLike);
  const feedTime = feedSeconds ? feedSeconds * 1000 : undefined;
  const byTrain = new Map<string, TripUpdate>();
  for (const [trainName, trips] of tripsOfTrain) {
    byTrain.set(trainName, joinLegs(trainName, currentTrip([...trips.values()], feedTime)));
  }
  return { byTrain, byTrip };
}

/** 读取某服务器的行程更新（两种索引一起）。 */
export async function fetchTripFeed(serverId: string, signal?: AbortSignal): Promise<TripFeed> {
  return decodeTripFeed(await fetchFeedBytes(serverId, "trip-updates", signal));
}
