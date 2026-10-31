import { transit_realtime } from "gtfs-realtime-bindings";
import { describe, expect, it } from "vitest";
import { decodeAlerts, decodeTripRealtime } from "./realtime.ts";

/** 用官方绑定库编码一份通告数据源，与 API 返回的二进制格式相同。 */
function alertsFeed(alerts: transit_realtime.IAlert[], ids = alerts.map((_, i) => `alert-${i}`)) {
  return transit_realtime.FeedMessage.encode({
    header: { gtfsRealtimeVersion: "2.0", timestamp: 1_793_400_000 },
    entity: alerts.map((alert, i) => ({ id: ids[i]!, alert })),
  }).finish();
}

describe("decodeAlerts", () => {
  it("读出通告标题和涉及的线路", async () => {
    const bytes = alertsFeed([
      {
        headerText: { translation: [{ text: "探索线：全线停运", language: "zh" }] },
        informedEntity: [{ agencyId: "survival:SURC", routeId: "survival:SURC:DS" }],
      },
    ]);

    const [alert] = await decodeAlerts(bytes);

    expect(alert?.title).toBe("探索线：全线停运");
    expect(alert?.lineCodes).toEqual(["DS"]);
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
});

describe("decodeTripRealtime", () => {
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

    const realtime = await decodeTripRealtime(bytes);

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
