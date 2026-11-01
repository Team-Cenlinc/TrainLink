import { describe, expect, it } from "vitest";
import type { TripRealtime } from "@/lib/realtime.ts";
import { applyRealtime } from "./live.ts";
import { planJourneys } from "./planner.ts";
import {
  alightReminderAt,
  collapsedStops,
  legStops,
  rideStatus,
  rideText,
  type TrainPosition,
} from "./ride.ts";
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
  const stop = (station: string, time: string, passed = false) => ({
    station,
    arrival: at(time),
    departure: at(time),
    passed,
    dwelling: false,
  });

  it("一段乘车的各站：上车站、经过的站、下车站，按站序，带计划时刻", () => {
    const ride = journey().legs[0]!;
    expect(legStops(timetable, ride, new Map(), dayStart, at("07:59"))).toEqual([
      stop("P1", "08:00"),
      stop("P2", "08:03"),
      stop("P3", "08:06"),
      stop("X", "08:10"),
    ]);
  });

  it("有实时数据时用预计时刻；实时数据里已经没有的站算经过了（列车位置）", () => {
    const rt = new Map([realtime("M1", { P3: "08:08", X: "08:12" })]);
    const ride = journey([...rt]).legs[0]!;
    // 按时刻 08:04 还没到 P2 的计划时刻之后多久，但实时数据说 P2 已经过了。
    expect(legStops(timetable, ride, rt, dayStart, at("08:04"))).toEqual([
      stop("P1", "08:00", true),
      stop("P2", "08:03", true),
      stop("P3", "08:08"),
      stop("X", "08:12"),
    ]);
  });

  it("实时数据只列出接下来几站时，后面没列出的站不算经过（按站序判断，不按有没有）", () => {
    const rt = new Map([realtime("M1", { P1: "08:00", P2: "08:03", P3: "08:06" })]);
    const ride = journey([...rt]).legs[0]!;
    expect(legStops(timetable, ride, rt, dayStart, at("07:59")).map((s) => s.passed)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it("没有实时数据时按时刻判断经过了没有", () => {
    const ride = journey().legs[0]!;
    const stops = legStops(timetable, ride, new Map(), dayStart, at("08:07"));
    expect(stops.map((s) => s.passed)).toEqual([true, true, true, false]);
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

  it("最后一段的下一站就是终点：写预计几点到", () => {
    expect(text("08:20").title).toBe("下一站 Q站 下车");
    expect(text("08:20").detail).toBe("终点站 · 预计 08:22 到站");
  });

  it("到达", () => {
    expect(text("08:23")).toEqual({ title: "已到达 Q站", detail: "这趟乘车结束了" });
  });
});

describe("collapsedStops", () => {
  it("还没上车：上车站、下车站，中间几站收成一段", () => {
    // 上车站 + 8 站（下标 0–8），下一站是 0（还在上车站）。
    expect(collapsedStops({ count: 9, next: 0, boarded: false })).toEqual([
      { kind: "row", index: 0 },
      { kind: "gap", count: 7 },
      { kind: "row", index: 8 },
    ]);
  });

  it("车上：刚过的站、下一站、下车站；前后跳过的各收成一段", () => {
    expect(collapsedStops({ count: 9, next: 4, boarded: true })).toEqual([
      { kind: "gap", count: 3 },
      { kind: "row", index: 3 },
      { kind: "row", index: 4 },
      { kind: "gap", count: 3 },
      { kind: "row", index: 8 },
    ]);
  });

  it("下一站就是下车站：不重复", () => {
    expect(collapsedStops({ count: 3, next: 2, boarded: true })).toEqual([
      { kind: "gap", count: 1 },
      { kind: "row", index: 1 },
      { kind: "row", index: 2 },
    ]);
  });
});

describe("停站", () => {
  // P1 坐 MT 到 P3：P1 有前一站 P0（列车 07:58 进站、08:00 开），P2 停两分钟（08:03 到、08:05 开）。
  const dwellTimetable = buildTimetable(
    gtfsFiles([
      {
        id: "D1",
        line: "MT",
        headsign: "P3",
        stops: [
          ["P0", "07:55"],
          ["P1", "07:58-08:00", "2"],
          ["P2", "08:03-08:05"],
          ["P3", "08:09"],
        ],
      },
    ]),
  );
  const [dwellPlan] = planJourneys(dwellTimetable, {
    from: "P1",
    to: "P3",
    departAfter: at("07:50"),
  });
  const dwellJourney = applyRealtime(dwellPlan!, new Map(), dayStart);
  const stopsAt = (
    now: string,
    rt: [string, TripRealtime][] = [],
    positions?: Map<string, TrainPosition>,
  ) => legStops(dwellTimetable, dwellJourney.legs[0]!, new Map(rt), dayStart, at(now), positions);
  const stateOf = (
    now: string,
    rt: [string, TripRealtime][] = [],
    positions?: Map<string, TrainPosition>,
  ) =>
    stopsAt(now, rt, positions).map(
      (s) => `${s.station}:${s.dwelling ? "停" : s.passed ? "过" : "前"}`,
    );
  /** D1 的实时数据：各站 [到, 开]。 */
  const dwellRt = (stops: Record<string, [string, string]>): [string, TripRealtime] => [
    tripOf("D1"),
    {
      cancelled: false,
      stops: new Map(
        Object.entries(stops).map(([code, [a, d]]) => [code, { arrival: ms(a), departure: ms(d) }]),
      ),
    },
  ];
  const at_ = (stoppedAt?: string) => new Map([[tripOf("D1"), { stoppedAt }]]);

  it("列车到了还没开：那一站是停靠中，不算经过", () => {
    expect(stateOf("08:04")).toEqual(["P1:过", "P2:停", "P3:前"]);
  });

  it("上车站：列车进站后、开车前也是停靠中；开出才算上了车", () => {
    expect(stateOf("07:57")).toEqual(["P1:前", "P2:前", "P3:前"]);
    expect(stateOf("07:59")).toEqual(["P1:停", "P2:前", "P3:前"]);
    expect(stateOf("08:01")).toEqual(["P1:过", "P2:前", "P3:前"]);
  });

  it("环线第二次经过上车站：进站时刻取开车前最近的那一次，不是上一圈", () => {
    const loop = buildTimetable(
      gtfsFiles([
        {
          id: "L1",
          line: "CL",
          headsign: "B",
          stops: [
            ["S", "07:20"],
            ["P1", "07:30"],
            ["A", "07:40"],
            ["P1", "07:58-08:00"],
            ["B", "08:05"],
          ],
        },
      ]),
    );
    const [plan] = planJourneys(loop, { from: "P1", to: "B", departAfter: at("07:50") });
    const leg = applyRealtime(plan!, new Map(), dayStart).legs[0]!;
    const boarding = (now: string) => legStops(loop, leg, new Map(), dayStart, at(now))[0];
    expect(boarding("07:45")).toMatchObject({ arrival: at("07:58"), dwelling: false });
    expect(boarding("07:59")).toMatchObject({ dwelling: true });
  });

  it("在直通的交接站上车：列车以前一段车次进站，也算已进站", () => {
    const through = buildTimetable(
      gtfsFiles([
        {
          id: "T1",
          line: "MT",
          headsign: "Q",
          stops: [
            ["P0", "07:50"],
            ["J", "07:58"],
          ],
        },
        {
          id: "T1",
          leg: 2,
          line: "WS",
          owner: "MT",
          headsign: "Q",
          stops: [
            ["J", "07:58-08:00"],
            ["Q", "08:10"],
          ],
        },
      ]),
    );
    const [plan] = planJourneys(through, { from: "J", to: "Q", departAfter: at("07:55") });
    const leg = applyRealtime(plan!, new Map(), dayStart).legs[0]!;
    expect(legStops(through, leg, new Map(), dayStart, at("07:59"))[0]).toMatchObject({
      station: "J",
      arrival: at("07:58"),
      dwelling: true,
    });
  });

  it("实时数据说列车晚点停在站上（到了、还没开），按实时判断", () => {
    const rt: [string, TripRealtime] = [
      tripOf("D1"),
      {
        cancelled: false,
        stops: new Map([
          ["P2", { arrival: ms("08:06"), departure: ms("08:08") }],
          ["P3", { arrival: ms("08:12"), departure: ms("08:12") }],
        ]),
      },
    ];
    expect(stateOf("08:05", [rt])).toEqual(["P1:过", "P2:前", "P3:前"]);
    expect(stateOf("08:07", [rt])).toEqual(["P1:过", "P2:停", "P3:前"]);
  });

  it("有列车位置时按位置判断停站：停在站上就是停靠中，开着就不是（不按预计时刻猜）", () => {
    const rt = dwellRt({ P2: ["08:06", "08:07"], P3: ["08:10", "08:10"] });
    // 早到：预计 08:06 到 P2，08:04 列车已经停在 P2。
    expect(stateOf("08:04", [rt], at_("P2"))).toEqual(["P1:过", "P2:停", "P3:前"]);
    // 预计时刻说已经到了，但列车还开着：还在路上。
    const late = dwellRt({ P2: ["08:03", "08:05"], P3: ["08:09", "08:09"] });
    expect(stateOf("08:04", [late], at_())).toEqual(["P1:过", "P2:前", "P3:前"]);
  });

  it("同一列车还在跑上一个车次、正好停在这一站：这一趟离到站还早，不算停靠（往返线的另一个方向）", () => {
    const rt = dwellRt({ P1: ["08:20", "08:22"], P2: ["08:25", "08:27"], P3: ["08:31", "08:31"] });
    expect(stateOf("07:59", [rt], at_("P1"))).toEqual(["P1:前", "P2:前", "P3:前"]);
  });

  it("列车晚开：过了预计开车时刻还停在站上，仍是停靠中", () => {
    const rt = dwellRt({ P2: ["08:03", "08:05"], P3: ["08:09", "08:09"] });
    expect(stateOf("08:06", [rt], at_("P2"))).toEqual(["P1:过", "P2:停", "P3:前"]);
  });

  it("没有列车位置时，只有实时数据里的当前站才可能是停靠中（刚开过的站还列着时，下一站还没到）", () => {
    const rt = dwellRt({ P1: ["08:00", "08:00"], P2: ["08:03", "08:05"], P3: ["08:09", "08:09"] });
    expect(stateOf("08:04", [rt])).toEqual(["P1:过", "P2:前", "P3:前"]);
  });

  it("下车站到了就算经过，不管列车还要停多久", () => {
    const rt: [string, TripRealtime] = [
      tripOf("D1"),
      {
        cancelled: false,
        stops: new Map([["P3", { arrival: ms("08:09"), departure: ms("08:15") }]]),
      },
    ];
    expect(stateOf("08:10", [rt])).toEqual(["P1:过", "P2:过", "P3:过"]);
  });

  it("等车时列车已进站：状态与提示写已进站", () => {
    const status = rideStatus(dwellJourney, [stopsAt("07:59")], at("07:59"));
    expect(status).toMatchObject({ kind: "wait", atPlatform: true, departsIn: 60 });
    expect(rideText(status, dwellJourney, (c) => c).detail).toBe("MT 往 P3 · 已进站，1 分后开车");
    const before = rideStatus(dwellJourney, [stopsAt("07:57")], at("07:57"));
    expect(before).toMatchObject({ kind: "wait", atPlatform: false });
  });

  it("车上停站：停着的那一站不算在还有几站里，提示写停靠哪一站", () => {
    const status = rideStatus(dwellJourney, [stopsAt("08:04")], at("08:04"));
    expect(status).toMatchObject({
      kind: "ride",
      stopsLeft: 1,
      nextStop: "P3",
      dwellingAt: "P2",
    });
    const longer = { ...status, stopsLeft: 3 } as typeof status;
    expect(rideText(longer, dwellJourney, (c) => c).detail).toBe("停靠 P2 · 在 P3 下车");
    const moving = rideStatus(dwellJourney, [stopsAt("08:06")], at("08:06"));
    expect(moving).toMatchObject({ kind: "ride", stopsLeft: 1, dwellingAt: undefined });
  });

  it("下车提醒在前一站开出时（停站后开车那一刻）", () => {
    expect(alightReminderAt(stopsAt("08:00"), dwellJourney.legs[0]!)).toBe(at("08:05"));
  });
});
