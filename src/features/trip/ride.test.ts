import { describe, expect, it } from "vitest";
import type { TripRealtime } from "@/lib/realtime.ts";
import { applyRealtime } from "./live.ts";
import { planJourneys } from "./planner.ts";
import { alightReminderAt, legStops, rideStatus, rideText } from "./ride.ts";
import { at, gtfsFiles } from "./testTimetable.ts";
import { buildTimetable } from "./timetable.ts";

/** 运营日 0 点（毫秒）；实时数据是绝对时刻，减去它就是运营日内的秒数。 */
const dayStart = Date.UTC(2026, 9, 31) - 8 * 3600_000;
const ms = (t: string) => dayStart + at(t) * 1000;
const tripOf = (id: string, line = "MT") => `survival:SURC:${line}:T:${id}`;

/** 一个车次的实时数据：只列出还没经过的站（与真实数据一样，经过的站不再出现）。 */
function realtime(id: string, stops: Record<string, string>, line = "MT"): [string, TripRealtime] {
  return [
    tripOf(id, line),
    {
      cancelled: false,
      stops: new Map(
        Object.entries(stops).map(([code, t]) => [code, { arrival: ms(t), departure: ms(t) }]),
      ),
    },
  ];
}

// P1 坐 MT 经 P2、P3 到 X（三站），在 X 换 WS 到 Q。
const timetable = buildTimetable(
  gtfsFiles([
    {
      id: "M1",
      line: "MT",
      headsign: "X",
      stops: [
        ["P1", "08:00", "2"],
        ["P2", "08:03"],
        ["P3", "08:06"],
        ["X", "08:10"],
      ],
    },
    {
      id: "W1",
      line: "WS",
      headsign: "Q",
      stops: [
        ["X", "08:14", "3"],
        ["Q", "08:22"],
      ],
    },
  ]),
);
const [planned] = planJourneys(timetable, { from: "P1", to: "Q", departAfter: at("07:55") });
const journey = (rt: [string, TripRealtime][] = []) =>
  applyRealtime(planned!, new Map(rt), dayStart);

describe("legStops", () => {
  it("一段乘车经过的各站（不含上车站），按站序，带计划时刻", () => {
    const ride = journey().legs[0]!;
    expect(legStops(timetable, ride, new Map(), dayStart, at("07:59"))).toEqual([
      { station: "P2", time: at("08:03"), passed: false },
      { station: "P3", time: at("08:06"), passed: false },
      { station: "X", time: at("08:10"), passed: false },
    ]);
  });

  it("有实时数据时用预计时刻；实时数据里已经没有的站算经过了（列车位置）", () => {
    const rt = new Map([realtime("M1", { P3: "08:08", X: "08:12" })]);
    const ride = journey([...rt]).legs[0]!;
    // 按时刻 08:04 还没到 P2 的计划时刻之后多久，但实时数据说 P2 已经过了。
    expect(legStops(timetable, ride, rt, dayStart, at("08:04"))).toEqual([
      { station: "P2", time: at("08:03"), passed: true },
      { station: "P3", time: at("08:08"), passed: false },
      { station: "X", time: at("08:12"), passed: false },
    ]);
  });

  it("实时数据只列出接下来几站时，后面没列出的站不算经过（按站序判断，不按有没有）", () => {
    const rt = new Map([realtime("M1", { P2: "08:03", P3: "08:06" })]);
    const ride = journey([...rt]).legs[0]!;
    expect(legStops(timetable, ride, rt, dayStart, at("08:01")).map((s) => s.passed)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("没有实时数据时按时刻判断经过了没有", () => {
    const ride = journey().legs[0]!;
    const stops = legStops(timetable, ride, new Map(), dayStart, at("08:07"));
    expect(stops.map((s) => s.passed)).toEqual([true, true, false]);
  });
});

describe("rideStatus", () => {
  const status = (now: string, rt: [string, TripRealtime][] = []) => {
    const j = journey(rt);
    const realtimeMap = new Map(rt);
    const stops = j.legs.map((leg) =>
      leg.kind === "ride" ? legStops(timetable, leg, realtimeMap, dayStart, at(now)) : [],
    );
    return rideStatus(j, stops, at(now));
  };

  it("上车前：在第一段的站台等车，还有几秒开车", () => {
    expect(status("07:57")).toMatchObject({ kind: "wait", legIndex: 0, departsIn: 180 });
  });

  it("车上：还有几站、下一站、几秒后到下车站", () => {
    expect(status("08:04")).toMatchObject({
      kind: "ride",
      legIndex: 0,
      stopsLeft: 2,
      nextStop: "P3",
      arrivesIn: 360,
    });
  });

  it("按实时位置推进：车还没到计划时刻，但实时数据说已经过了 P2、P3", () => {
    expect(status("08:04", [realtime("M1", { X: "08:09" })])).toMatchObject({
      kind: "ride",
      stopsLeft: 1,
      nextStop: "X",
      arrivesIn: 300,
    });
  });

  it("到了换乘站：等下一段的车", () => {
    expect(status("08:11")).toMatchObject({ kind: "wait", legIndex: 1, departsIn: 180 });
  });

  it("全程走完：到达", () => {
    expect(status("08:23")).toMatchObject({ kind: "arrived" });
  });

  it("整趟进度按预计时刻算，0 到 1", () => {
    expect(status("07:50").progress).toBe(0);
    expect(status("08:11").progress).toBeCloseTo(11 / 22);
    expect(status("08:30").progress).toBe(1);
  });
});

describe("alightReminderAt", () => {
  it("下车提醒在前一站开出时（下一站就下车）", () => {
    const ride = journey().legs[0]!;
    expect(alightReminderAt(legStops(timetable, ride, new Map(), dayStart, 0), ride)).toBe(
      at("08:06"),
    );
  });

  it("只坐一站时，开车就提醒", () => {
    const ride = journey().legs[1]!;
    expect(alightReminderAt(legStops(timetable, ride, new Map(), dayStart, 0), ride)).toBe(
      at("08:14"),
    );
  });
});

describe("rideText", () => {
  const name = (code: string) => `${code}站`;
  const text = (now: string, rt: [string, TripRealtime][] = []) => {
    const j = journey(rt);
    const realtimeMap = new Map(rt);
    const stops = j.legs.map((leg) =>
      leg.kind === "ride" ? legStops(timetable, leg, realtimeMap, dayStart, at(now)) : [],
    );
    return rideText(rideStatus(j, stops, at(now)), j, name);
  };

  it("上车前：哪个站台、哪班车、几分后开", () => {
    expect(text("07:57")).toEqual({
      title: "2 号站台上车",
      detail: "MT 往 X · 3 分后开车",
    });
  });

  it("车上：还有几站，在哪下车", () => {
    expect(text("08:04")).toEqual({
      title: "还有 2 站 · 6 分",
      detail: "下一站 P3站 · 在 X站 下车",
    });
  });

  it("下一站下车：说清楚下车后换乘哪班车", () => {
    expect(text("08:07")).toEqual({
      title: "下一站 X站 下车",
      detail: "换乘 WS 往 Q · 3 号站台",
    });
  });

  it("换乘站等车", () => {
    expect(text("08:11")).toEqual({
      title: "X站 换乘 · 3 号站台",
      detail: "WS 往 Q · 3 分后开车",
    });
  });

  it("最后一段的下一站就是终点", () => {
    expect(text("08:20").title).toBe("下一站 Q站 下车");
    expect(text("08:20").detail).toBe("就是终点");
  });

  it("到达", () => {
    expect(text("08:23")).toEqual({ title: "已到达 Q站", detail: "这趟乘车结束了" });
  });
});
