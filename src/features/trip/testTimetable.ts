/**
 * 测试用的小型 GTFS：用几行描述写出车次，生成与真实 GTFS 包相同格式的 CSV 文本。
 * 站码直接写（P1、P2…），站台默认 1 号；时刻写成 "08:05" 或 "24:05:30"。
 */

export interface TripSpec {
  id: string;
  line: string;
  headsign: string;
  /** 按站序：[站码, 时刻] 或 [站码, 时刻, 站台]。到发同一时刻。 */
  stops: [string, string, string?][];
  /** 跨线直通的后一段：trip_id 写成 base~2，与 GTFS 包一致。 */
  leg?: number;
  /** 车次所属线路：直通后一段的 route_id 是新线路，trip_id 里仍是所属线路（默认同 line）。 */
  owner?: string;
}

export interface WalkSpec {
  from: string;
  to: string;
  seconds: number;
}

const stopId = (code: string, platform = "1") => `survival:SURC:S:${code}:${platform}`;
const time = (t: string) => (t.split(":").length === 2 ? `${t}:00` : t);

export function gtfsFiles(trips: TripSpec[], walks: WalkSpec[] = []) {
  const stations = new Set(trips.flatMap((t) => t.stops.map(([code]) => code)));
  const platforms = new Set(trips.flatMap((t) => t.stops.map(([code, , p]) => stopId(code, p))));
  const tripId = (t: TripSpec) =>
    `survival:SURC:${t.owner ?? t.line}:T:${t.id}${t.leg && t.leg > 1 ? `~${t.leg}` : ""}`;
  return {
    trips: [
      "route_id,service_id,trip_id,trip_headsign,trip_short_name",
      ...trips.map(
        (t) => `survival:SURC:${t.line},survival:DAILY,${tripId(t)},${t.headsign},${t.id}`,
      ),
    ].join("\n"),
    stops: [
      "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,platform_code",
      ...[...stations].map((code) => `survival:SURC:S:${code},${code},0,0,1,,`),
      ...[...platforms].map((id) => {
        const [, , , code, platform] = id.split(":");
        return `${id},${code},0,0,0,survival:SURC:S:${code},${platform}`;
      }),
    ].join("\n"),
    stopTimes: [
      "trip_id,arrival_time,departure_time,stop_sequence,stop_id",
      ...trips.flatMap((t) =>
        t.stops.map(
          ([code, at, platform], i) =>
            `${tripId(t)},${time(at)},${time(at)},${i},${stopId(code, platform)}`,
        ),
      ),
    ].join("\n"),
    transfers: [
      "from_stop_id,to_stop_id,transfer_type,min_transfer_time,from_trip_id,to_trip_id",
      ...walks.map((w) => `survival:SURC:S:${w.from},survival:SURC:S:${w.to},2,${w.seconds},,`),
    ].join("\n"),
  };
}

/** "08:05" → 当天 0 点起的秒数。 */
export const at = (t: string) => {
  const [h = 0, m = 0, s = 0] = t.split(":").map(Number);
  return h * 3600 + m * 60 + s;
};
