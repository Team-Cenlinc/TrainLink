import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { gtfsOutdated, patternOfTrip, watchGtfsFreshness } from "./gtfsFreshness.ts";
import type { TripFeed } from "./realtime.ts";

const trip = (pattern: string, n: string) => `survival:SURC:MT:SURC_Temporary:${pattern}-${n}`;
const connection = (tripId: string) => ({ tripId });

describe("本地 GTFS 是不是旧了", () => {
  it("车次的交路键：运营方、线路与交路名（直通的后几段 ~N 同属一个交路）", () => {
    expect(patternOfTrip(trip("MT-2O_ShortD", "208~2"))).toBe("SURC:MT:MT-2O_ShortD");
  });

  it("实时里有 GTFS 索引没有的交路：线路站序过时了（例如一段支线恢复运营）", () => {
    const gtfs = { routeStops: new Map([["SURC:MT:MT-2O_ShortD", ["PPK", "HHU"]]]) };
    expect(gtfsOutdated({ realtimeTrips: [trip("MT-2O_ShortD", "001")], gtfs }).gtfs).toBe(false);
    expect(gtfsOutdated({ realtimeTrips: [trip("MT-1O_ShortD", "001")], gtfs }).gtfs).toBe(true);
  });

  it("实时里有时刻表没有的车次：行程规划的时刻表过时了", () => {
    const timetable = { connections: [connection(trip("MT-2O_ShortD", "001"))] };
    const known = gtfsOutdated({ realtimeTrips: [trip("MT-2O_ShortD", "001")], timetable });
    const unknown = gtfsOutdated({ realtimeTrips: [trip("MT-2O_ShortD", "002")], timetable });
    expect(known.timetable).toBe(false);
    expect(unknown.timetable).toBe(true);
  });

  it("车次号格式不对时不拿来比", () => {
    const gtfs = { routeStops: new Map<string, string[]>() };
    expect(patternOfTrip("M1")).toBeUndefined();
    expect(gtfsOutdated({ realtimeTrips: ["M1"], gtfs }).gtfs).toBe(false);
  });

  it("本地还没有数据时不算过时", () => {
    expect(gtfsOutdated({ realtimeTrips: [trip("MT-1O_ShortD", "001")] })).toEqual({
      gtfs: false,
      timetable: false,
    });
  });
});

describe("实时更新时校验本地 GTFS", () => {
  const serverId = "survival";
  const feed = (...tripIds: string[]): TripFeed => ({
    byTrain: new Map(),
    byTrip: new Map(tripIds.map((id) => [id, { cancelled: false, stops: new Map() }])),
  });

  function setup() {
    const client = new QueryClient();
    let now = 0;
    const stop = watchGtfsFreshness(client, () => now);
    client.setQueryData(["gtfs", serverId], {
      routeStops: new Map([["SURC:MT:MT-2O_ShortD", ["PPK", "HHU"]]]),
    });
    client.setQueryData(["timetable", serverId], {
      connections: [connection(trip("MT-2O_ShortD", "001"))],
    });
    const invalidated = () => ({
      gtfs: client.getQueryState(["gtfs", serverId])?.isInvalidated,
      timetable: client.getQueryState(["timetable", serverId])?.isInvalidated,
    });
    return { client, stop, invalidated, advance: (ms: number) => (now += ms) };
  }

  it("实时车次都认得：什么也不做", () => {
    const { client, invalidated } = setup();
    client.setQueryData(["tripFeed", serverId], feed(trip("MT-2O_ShortD", "001")));
    expect(invalidated()).toEqual({ gtfs: false, timetable: false });
  });

  it("出现不认得的交路：GTFS 索引与时刻表都重新读取", () => {
    const { client, invalidated } = setup();
    client.setQueryData(["tripFeed", serverId], feed(trip("MT-1O_ShortD", "001")));
    expect(invalidated()).toEqual({ gtfs: true, timetable: true });
  });

  it("临时加开的车次（本来就不在 GTFS 里）不算", () => {
    const { client, invalidated } = setup();
    const added = feed(trip("MT-9X_Extra", "001"));
    added.byTrip.set(trip("MT-9X_Extra", "001"), {
      cancelled: false,
      unlisted: true,
      stops: new Map(),
    });
    client.setQueryData(["tripFeed", serverId], added);
    expect(invalidated()).toEqual({ gtfs: false, timetable: false });
  });

  it("只是多了车次：只重新读时刻表", () => {
    const { client, invalidated } = setup();
    client.setQueryData(["tripFeed", serverId], feed(trip("MT-2O_ShortD", "002")));
    expect(invalidated()).toEqual({ gtfs: false, timetable: true });
  });

  it("重新读过以后 5 分钟内不再读：服务器两边一直对不上时不会反复下载", () => {
    const { client, invalidated, advance } = setup();
    client.setQueryData(["tripFeed", serverId], feed(trip("MT-1O_ShortD", "001")));
    // 重新读到的仍是旧数据。
    client.setQueryData(["gtfs", serverId], { routeStops: new Map() });
    advance(60_000);
    client.setQueryData(["tripFeed", serverId], feed(trip("MT-1O_ShortD", "002")));
    expect(invalidated().gtfs).toBe(false);

    advance(5 * 60_000);
    client.setQueryData(["tripFeed", serverId], feed(trip("MT-1O_ShortD", "003")));
    expect(invalidated().gtfs).toBe(true);
  });

  it("停止监听后不再校验", () => {
    const { client, stop, invalidated } = setup();
    stop();
    client.setQueryData(["tripFeed", serverId], feed(trip("MT-1O_ShortD", "001")));
    expect(invalidated()).toEqual({ gtfs: false, timetable: false });
  });
});
