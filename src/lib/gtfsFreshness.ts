import type { QueryClient } from "@tanstack/react-query";
import type { GtfsIndex } from "./gtfs.ts";
import type { TripFeed } from "./realtime.ts";

/**
 * 本地的 GTFS 是不是旧了：实时行程更新（每 15 秒）里出现本地 GTFS 不认得的车次，就说明服务器换了时刻表，
 * 重新读取 GTFS 索引（线路站序、交路）与行程规划的时刻表。
 * GTFS 本身五分钟才算过期，而且只在打开页面、切回 App 时才重新读；一直开着的 App 靠这里跟上。
 */

/** 两次重新读取至少隔这么久：服务器两边的数据一直对不上时，不会每 15 秒下载一次 GTFS 包。 */
const minInterval = 5 * 60_000;

/**
 * 车次的交路键（同 GTFS 索引的 routeStops）：survival:SURC:MT:SURC_Temporary:MT-2O_ShortD-208~2 → SURC:MT:MT-2O_ShortD。
 * 车次号不是「服务器:运营方:线路:…:车次」的格式时为 undefined（不拿来比，免得永远对不上）。
 */
export function patternOfTrip(tripId: string): string | undefined {
  const parts = tripId.split(":");
  if (parts.length < 4) return undefined;
  const pattern = parts.at(-1)!.replace(/~\d+$/, "").replace(/-\d+$/, "");
  return `${parts[1]}:${parts[2]}:${pattern}`;
}

/** 时刻表里的车次，按时刻表对象缓存：实时每次更新都要查一遍，不必每次重建。 */
const tripsOf = new WeakMap<object, Set<string>>();
function timetableTrips(connections: { tripId: string }[]): Set<string> {
  let trips = tripsOf.get(connections);
  if (!trips) {
    trips = new Set(connections.map((c) => c.tripId));
    tripsOf.set(connections, trips);
  }
  return trips;
}

/**
 * 哪些本地数据过时了：gtfs 是实时里有 GTFS 索引没有的交路，timetable 是实时里有时刻表没有的车次。
 * 本地还没有那份数据时不算过时（读到了自然是新的）。
 */
export function gtfsOutdated(input: {
  realtimeTrips: Iterable<string>;
  gtfs?: Pick<GtfsIndex, "routeStops">;
  timetable?: { connections: { tripId: string }[] };
}): { gtfs: boolean; timetable: boolean } {
  const known = input.timetable && timetableTrips(input.timetable.connections);
  let gtfs = false;
  let timetable = false;
  for (const tripId of input.realtimeTrips) {
    const pattern = patternOfTrip(tripId);
    if (input.gtfs && pattern !== undefined && !input.gtfs.routeStops.has(pattern)) gtfs = true;
    if (known && !known.has(tripId)) timetable = true;
  }
  // 交路都没有的车次，时刻表也一定没有（两者来自同一个 GTFS 包）。
  return { gtfs, timetable: timetable || (gtfs && !!input.timetable) };
}

/**
 * 每次读到实时行程更新时校验本地 GTFS，过时就让对应的查询重新读取。只听查询缓存，不多发请求。
 * @returns 停止监听。
 */
export function watchGtfsFreshness(client: QueryClient, now = Date.now): () => void {
  const lastRefresh = new Map<string, number>();
  return client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    const [kind, serverId] = event.query.queryKey;
    if (kind !== "tripFeed" || typeof serverId !== "string") return;
    const last = lastRefresh.get(serverId);
    if (last !== undefined && now() - last < minInterval) return;

    const feed = event.query.state.data as TripFeed | undefined;
    // 临时加开等本来就不在 GTFS 里的车次不算。
    const listed = [...(feed?.byTrip ?? [])].filter(([, t]) => !t.unlisted).map(([id]) => id);
    const outdated = gtfsOutdated({
      realtimeTrips: listed,
      gtfs: client.getQueryData<GtfsIndex>(["gtfs", serverId]),
      timetable: client.getQueryData(["timetable", serverId]),
    });
    if (!outdated.gtfs && !outdated.timetable) return;
    lastRefresh.set(serverId, now());
    if (outdated.gtfs) void client.invalidateQueries({ queryKey: ["gtfs", serverId] });
    if (outdated.timetable) void client.invalidateQueries({ queryKey: ["timetable", serverId] });
  });
}
