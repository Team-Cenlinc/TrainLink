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
  /** 涉及的线路码；为空表示全网通告。 */
  lineCodes: string[];
  /** 对运营的影响：停运、班次减少，或其他（公告、未说明）。 */
  effect: AlertEffect;
  /** 生效时段（毫秒）；没有时段表示一直生效，start / end 缺省表示不限。 */
  activePeriods?: { start?: number; end?: number }[];
}

export type AlertEffect = "noService" | "reducedService" | "other";

type Translated = { translation?: { text?: string | null; language?: string | null }[] | null };

/** 多语言文字取中文（language 以 zh 开头），没有中文时取第一种。 */
function chineseText(value: Translated | null | undefined): string | undefined {
  const translations = value?.translation ?? [];
  const zh = translations.find((t) => t.language?.startsWith("zh"));
  return (zh ?? translations[0])?.text ?? undefined;
}

/** 解码通告数据源。route_id 形如 survival:SURC:DS，取出线路码 DS。 */
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
        lineCodes: (alert.informedEntity ?? [])
          .map((e) => e.routeId?.split(":")[2])
          .filter((code): code is string => Boolean(code)),
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
  /** 各站预计到发时刻（毫秒），以站码索引。 */
  stops: Map<string, { arrival?: number; departure?: number }>;
}

/** 解码行程更新，按车次（trip_id）索引；与按列车名索引的 fetchTripUpdates 不同，取消的车次也在里面。 */
export async function decodeTripRealtime(bytes: Uint8Array): Promise<Map<string, TripRealtime>> {
  const realtime = await loadRealtime();
  const feed = realtime.FeedMessage.decode(bytes);
  const { CANCELED } = realtime.TripDescriptor.ScheduleRelationship;
  const byTrip = new Map<string, TripRealtime>();
  for (const entity of feed.entity) {
    const update = entity.tripUpdate;
    const tripId = update?.trip.tripId;
    if (!update || !tripId) continue;
    const stops = new Map<string, { arrival?: number; departure?: number }>();
    for (const s of update.stopTimeUpdate ?? []) {
      const station = stationOfStop(s.stopId);
      if (!station) continue;
      const arrival = toNumber(s.arrival?.time as LongLike);
      const departure = toNumber(s.departure?.time as LongLike);
      stops.set(station, {
        arrival: arrival ? arrival * 1000 : undefined,
        departure: departure ? departure * 1000 : undefined,
      });
    }
    byTrip.set(tripId, {
      cancelled: update.trip.scheduleRelationship === CANCELED,
      delaySeconds: update.delay ?? undefined,
      stops,
    });
  }
  return byTrip;
}

/** 读取某服务器各车次的实时情况（行程规划用）。 */
export async function fetchTripRealtime(serverId: string, signal?: AbortSignal) {
  return decodeTripRealtime(await fetchFeedBytes(serverId, "trip-updates", signal));
}

/** 读取某服务器的行程更新，按列车名索引。 */
export async function fetchTripUpdates(
  serverId: string,
  signal?: AbortSignal,
): Promise<Map<string, TripUpdate>> {
  const feed = await fetchFeed(serverId, "trip-updates", signal);

  const byTrain = new Map<string, TripUpdate>();
  for (const entity of feed.entity) {
    const update = entity.tripUpdate;
    const trainName = update?.vehicle?.id;
    if (!update || !trainName) continue;
    const stops: StopTime[] = (update.stopTimeUpdate ?? [])
      .map((s) => {
        const arrival = toNumber(s.arrival?.time as LongLike);
        const departure = toNumber(s.departure?.time as LongLike);
        return {
          stationCode: stationOfStop(s.stopId) ?? "",
          // 0 表示没有这个时刻（例如终点站没有发车时刻）。
          arrival: arrival ? arrival * 1000 : undefined,
          departure: departure ? departure * 1000 : undefined,
        };
      })
      .filter((s) => s.stationCode);

    // 跨线直通的列车按线路拆成几条更新（与 GTFS 的分段一致），按顺序接起来；
    // 换乘站在前一段是终点（只有到达）、在后一段是起点，合并成一站。
    const previous = byTrain.get(trainName);
    if (previous) {
      const junction = previous.stops.at(-1);
      const [first, ...rest] = stops;
      if (junction && first?.stationCode === junction.stationCode) {
        junction.departure = first.departure ?? junction.departure;
        previous.stops.push(...rest);
      } else {
        previous.stops.push(...stops);
      }
      continue;
    }
    byTrain.set(trainName, {
      trainName,
      tripId: update.trip.tripId ?? "",
      delaySeconds: update.delay ?? undefined,
      stops,
    });
  }
  return byTrain;
}
