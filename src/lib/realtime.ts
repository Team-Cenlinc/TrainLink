import { railApiBase } from "./railApi.ts";

/**
 * GTFS-Realtime 行程更新（trip-updates）：每列车接下来各站的预计到发时刻与晚点。
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

/** 读取某服务器的行程更新，按列车名索引。 */
export async function fetchTripUpdates(
  serverId: string,
  signal?: AbortSignal,
): Promise<Map<string, TripUpdate>> {
  const [response, bindings] = await Promise.all([
    fetch(`${railApiBase}/v1/rail/servers/${encodeURIComponent(serverId)}/gtfs-rt/trip-updates`, {
      signal,
    }),
    import("gtfs-realtime-bindings"),
  ]);
  if (!response.ok) throw new Error(`行程更新读取失败：${response.status}`);
  // 这个库是 CommonJS，打包后命名导出可能挂在 default 上。
  const realtime =
    bindings.transit_realtime ??
    (bindings as unknown as { default: typeof bindings }).default.transit_realtime;
  const feed = realtime.FeedMessage.decode(new Uint8Array(await response.arrayBuffer()));

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
