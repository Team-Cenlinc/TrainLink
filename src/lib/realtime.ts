import { railApiBase } from "./railApi.ts";

/**
 * GTFS-Realtime 实时数据：
 * - 行程更新（trip-updates）：每列车接下来各站的预计到发时刻与晚点；
 * - 车辆位置（vehicle-positions）：每列车每节车厢的满载率。
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

/** 读取并解码某服务器的一个 GTFS-RT 数据源（trip-updates 或 vehicle-positions）。 */
async function fetchFeed(serverId: string, feedName: string, signal?: AbortSignal) {
  const [response, bindings] = await Promise.all([
    fetch(`${railApiBase}/v1/rail/servers/${encodeURIComponent(serverId)}/gtfs-rt/${feedName}`, {
      signal,
    }),
    import("gtfs-realtime-bindings"),
  ]);
  if (!response.ok) throw new Error(`实时数据 ${feedName} 读取失败：${response.status}`);
  // 这个库是 CommonJS，打包后命名导出可能挂在 default 上。
  const realtime =
    bindings.transit_realtime ??
    (bindings as unknown as { default: typeof bindings }).default.transit_realtime;
  return realtime.FeedMessage.decode(new Uint8Array(await response.arrayBuffer()));
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
