import { transit_realtime } from "gtfs-realtime-bindings";
import { describe, expect, it } from "vitest";
import { decodeAlerts, decodeTripFeed } from "./realtime.ts";

/** 用官方绑定库编码一份通告数据源，与 API 返回的二进制格式相同。 */
function alertsFeed(alerts: transit_realtime.IAlert[], ids = alerts.map((_, i) => `alert-${i}`)) {
  return transit_realtime.FeedMessage.encode({
    header: { gtfsRealtimeVersion: "2.0", timestamp: 1_793_400_000 },
    entity: alerts.map((alert, i) => ({ id: ids[i]!, alert })),
  }).finish();
}

describe("decodeAlerts", () => {
  it("读出通告标题和涉及的线路（运营方与线路码）", async () => {
    const bytes = alertsFeed([
      {
        headerText: { translation: [{ text: "探索线：全线停运", language: "zh" }] },
        informedEntity: [{ agencyId: "survival:SURC", routeId: "survival:SURC:DS" }],
      },
    ]);

    const [alert] = await decodeAlerts(bytes);

    expect(alert?.title).toBe("探索线：全线停运");
    expect(alert?.lines).toEqual([{ operatorCode: "SURC", lineCode: "DS" }]);
  });

  it("有多种语言时取中文，标题与正文都是", async () => {
    const bytes = alertsFeed([
      {
        headerText: {
          translation: [
            { text: "Welcome to try out Island Line!", language: "en" },
            { text: "欢迎试乘海岛线！", language: "zh" },
          ],
        },
        descriptionText: {
          translation: [
            { text: "Trial service.", language: "en" },
            { text: "海岛线一期工程目前开始测试时刻表运行。", language: "zh" },
          ],
        },
      },
    ]);

    const [alert] = await decodeAlerts(bytes);

    expect(alert?.title).toBe("欢迎试乘海岛线！");
    expect(alert?.body).toBe("海岛线一期工程目前开始测试时刻表运行。");
  });

  it("读出对运营的影响和生效时段（秒换成毫秒）", async () => {
    const Effect = transit_realtime.Alert.Effect;
    const bytes = alertsFeed([
      { effect: Effect.NO_SERVICE, activePeriod: [{ start: 1_793_000_000, end: 1_793_100_000 }] },
      { effect: Effect.REDUCED_SERVICE },
      { effect: Effect.UNKNOWN_EFFECT },
    ]);

    const alerts = await decodeAlerts(bytes);

    expect(alerts.map((a) => a.effect)).toEqual(["noService", "reducedService", "other"]);
    expect(alerts[0]?.activePeriods).toEqual([
      { start: 1_793_000_000_000, end: 1_793_100_000_000 },
    ]);
    expect(alerts[1]?.activePeriods).toEqual([]);
  });

  it("同一条线路被提到几次（例如分方向各列一次）也只记一次", async () => {
    const bytes = alertsFeed([
      {
        informedEntity: [
          { routeId: "survival:SURC:MT", directionId: 0 },
          { routeId: "survival:SURC:MT", directionId: 1 },
          { routeId: "survival:SURC:WS" },
        ],
      },
    ]);

    const [alert] = await decodeAlerts(bytes);

    expect(alert?.lines).toEqual([
      { operatorCode: "SURC", lineCode: "MT" },
      { operatorCode: "SURC", lineCode: "WS" },
    ]);
  });
});

describe("decodeTripFeed：按车次", () => {
  it("按车次读出各站预计时刻（秒换成毫秒）与取消的车次", async () => {
    const { ScheduleRelationship } = transit_realtime.TripDescriptor;
    const bytes = transit_realtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: "2.0", timestamp: 1_793_400_000 },
      entity: [
        {
          id: "running",
          tripUpdate: {
            trip: { tripId: "survival:SURC:MT:T:M1" },
            delay: 120,
            stopTimeUpdate: [
              {
                stopId: "survival:SURC:S:PTK:1",
                arrival: { time: 1_793_400_060 },
                departure: { time: 1_793_400_090 },
              },
            ],
          },
        },
        {
          id: "cancelled",
          tripUpdate: {
            trip: {
              tripId: "survival:SURC:MT:T:M2",
              scheduleRelationship: ScheduleRelationship.CANCELED,
            },
          },
        },
      ],
    }).finish();

    const realtime = (await decodeTripFeed(bytes)).byTrip;

    expect(realtime.get("survival:SURC:MT:T:M1")).toMatchObject({
      cancelled: false,
      delaySeconds: 120,
    });
    expect(realtime.get("survival:SURC:MT:T:M1")?.stops.get("PTK")).toEqual({
      arrival: 1_793_400_060_000,
      departure: 1_793_400_090_000,
    });
    expect(realtime.get("survival:SURC:MT:T:M2")?.cancelled).toBe(true);
  });
});

describe("decodeTripFeed", () => {
  it("同一份数据同时按列车名与按车次索引；直通列车的两段按列车名接成一条，换乘站只留一次", async () => {
    const bytes = transit_realtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: "2.0", timestamp: 1_793_400_000 },
      entity: [
        {
          id: "leg-1",
          tripUpdate: {
            trip: { tripId: "survival:SURC:MT:T:D1" },
            vehicle: { id: "SURC-MT-RN-1" },
            stopTimeUpdate: [
              { stopId: "survival:SURC:S:PTK:1", departure: { time: 1_793_400_060 } },
              { stopId: "survival:SURC:S:HHU:1", arrival: { time: 1_793_400_300 } },
            ],
          },
        },
        {
          id: "leg-2",
          tripUpdate: {
            trip: { tripId: "survival:SURC:MT:T:D1~2" },
            vehicle: { id: "SURC-MT-RN-1" },
            stopTimeUpdate: [
              { stopId: "survival:SURC:S:HHU:3", departure: { time: 1_793_400_330 } },
              { stopId: "survival:SURC:S:NTA:2", arrival: { time: 1_793_400_900 } },
            ],
          },
        },
      ],
    }).finish();

    const { byTrain, byTrip } = await decodeTripFeed(bytes);

    expect(byTrain.get("SURC-MT-RN-1")?.stops).toEqual([
      { stationCode: "PTK", arrival: undefined, departure: 1_793_400_060_000 },
      { stationCode: "HHU", arrival: 1_793_400_300_000, departure: 1_793_400_330_000 },
      { stationCode: "NTA", arrival: 1_793_400_900_000, departure: undefined },
    ]);
    expect([...byTrip.keys()]).toEqual(["survival:SURC:MT:T:D1", "survival:SURC:MT:T:D1~2"]);
  });
});

describe("decodeTripFeed：一列车同时带着当前车次和下一个车次", () => {
  /** 一条行程更新：车次、列车、车次的开行日期与时刻、各站（站码与到发时刻，秒）。 */
  function tripUpdate(
    tripId: string,
    vehicleId: string,
    startTime: string,
    stops: [string, number][],
  ): transit_realtime.IFeedEntity {
    return {
      id: tripId,
      tripUpdate: {
        trip: { tripId, startDate: "20261031", startTime },
        vehicle: { id: vehicleId },
        stopTimeUpdate: stops.map(([code, time]) => ({
          stopId: `survival:SURC:S:${code}:1`,
          arrival: { time },
          departure: { time },
        })),
      },
    };
  }

  it("按列车名只取当前车次（开行最早的），不把折返后的下一个车次接在后面", async () => {
    const bytes = transit_realtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: "2.0", timestamp: 1_793_400_000 },
      entity: [
        // 数据源里下一个车次可能排在前面。
        tripUpdate("survival:SURC:MT:T:MT-3N_DPExp-081~2", "SURC-MT-RP-3233", "23:44:50", [
          ["PPK", 1_793_400_900],
          ["HHU", 1_793_401_200],
        ]),
        tripUpdate("survival:SURC:MT:T:MT-2O_ShortD-330", "SURC-MT-RP-3233", "23:38:26", [
          ["HHU", 1_793_400_100],
          ["PPK", 1_793_400_800],
        ]),
      ],
    }).finish();

    const train = (await decodeTripFeed(bytes)).byTrain.get("SURC-MT-RP-3233");

    expect(train?.tripId).toBe("survival:SURC:MT:T:MT-2O_ShortD-330");
    expect(train?.stops.map((s) => s.stationCode)).toEqual(["HHU", "PPK"]);
  });

  it("所有站都已过去的车次不算当前车次，即使它开得更早", async () => {
    const bytes = transit_realtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: "2.0", timestamp: 1_793_400_000 },
      entity: [
        tripUpdate("survival:SURC:MT:T:MT-3O_DPExp-080", "SURC-MT-RP-3233", "23:20:00", [
          ["NTA", 1_793_399_000],
          ["PPK", 1_793_399_500],
        ]),
        tripUpdate("survival:SURC:MT:T:MT-2O_ShortD-330", "SURC-MT-RP-3233", "23:38:26", [
          ["PPK", 1_793_400_100],
          ["HHU", 1_793_400_800],
        ]),
      ],
    }).finish();

    const train = (await decodeTripFeed(bytes)).byTrain.get("SURC-MT-RP-3233");

    expect(train?.tripId).toBe("survival:SURC:MT:T:MT-2O_ShortD-330");
  });

  it("同一车次的直通分段按段号接起来，不论在数据源里的先后", async () => {
    const bytes = transit_realtime.FeedMessage.encode({
      header: { gtfsRealtimeVersion: "2.0", timestamp: 1_793_400_000 },
      entity: [
        tripUpdate("survival:SURC:MT:T:MT-3N_DPExp-081~2", "SURC-MT-RP-3233", "23:44:50", [
          ["HHU", 1_793_400_900],
          ["NTA", 1_793_401_200],
        ]),
        tripUpdate("survival:SURC:MT:T:MT-3N_DPExp-081", "SURC-MT-RP-3233", "23:38:26", [
          ["PPK", 1_793_400_100],
          ["HHU", 1_793_400_800],
        ]),
      ],
    }).finish();

    const train = (await decodeTripFeed(bytes)).byTrain.get("SURC-MT-RP-3233");

    expect(train?.tripId).toBe("survival:SURC:MT:T:MT-3N_DPExp-081");
    expect(train?.stops.map((s) => s.stationCode)).toEqual(["PPK", "HHU", "NTA"]);
  });
});
