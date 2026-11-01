import { describe, expect, it } from "vitest";
import type { TripRealtime } from "@/lib/realtime.ts";
import { applyRealtime, findJourney, liveJourneys } from "./live.ts";
import { planJourneys } from "./planner.ts";
import { at, gtfsFiles } from "./testTimetable.ts";
import { buildTimetable } from "./timetable.ts";

/** 运营日 0 点（毫秒）；实时数据是绝对时刻，减去它就是运营日内的秒数。 */
const dayStart = Date.UTC(2026, 9, 31) - 8 * 3600_000;
const ms = (t: string) => dayStart + at(t) * 1000;

function realtime(
  tripId: string,
  stops: Record<string, { arrival?: string; departure?: string }>,
  extra: Partial<TripRealtime> = {},
): [string, TripRealtime] {
  return [
    tripId,
    {
      cancelled: false,
      ...extra,
      stops: new Map(
        Object.entries(stops).map(([code, t]) => [
          code,
          {
            arrival: t.arrival ? ms(t.arrival) : undefined,
            departure: t.departure ? ms(t.departure) : undefined,
          },
        ]),
      ),
    },
  ];
}

const timetable = buildTimetable(
  gtfsFiles([
    {
      id: "M1",
      line: "MT",
      headsign: "X",
      stops: [
        ["P1", "08:00"],
        ["X", "08:10"],
      ],
    },
    {
      id: "W1",
      line: "WS",
      headsign: "Q",
      stops: [
        ["X", "08:13"],
        ["Q", "08:22"],
      ],
    },
  ]),
);
const [journey] = planJourneys(timetable, { from: "P1", to: "Q", departAfter: at("07:55") });

describe("applyRealtime", () => {
  it("用实时数据替换各段的出发、到达，给出整个行程的预计到达与晚点分钟数", () => {
    const live = applyRealtime(
      journey!,
      new Map([
        realtime("survival:SURC:WS:T:W1", { X: { departure: "08:15" }, Q: { arrival: "08:24" } }),
      ]),
      dayStart,
    );

    expect(live.legs.map((l) => [l.live.departure, l.live.arrival])).toEqual([
      [at("08:00"), at("08:10")],
      [at("08:15"), at("08:24")],
    ]);
    expect(live.live).toEqual({ departure: at("08:00"), arrival: at("08:24") });
    expect(live.delayMinutes).toBe(2);
    expect(live.riskyChange).toBe(false);
  });

  it("前一段晚到、留给换乘的时间不足 2 分钟时，标出换乘可能赶不上", () => {
    const live = applyRealtime(
      journey!,
      new Map([realtime("survival:SURC:MT:T:M1", { X: { arrival: "08:12" } })]),
      dayStart,
    );

    expect(live.riskyChange).toBe(true);
  });

  describe("站外换乘的步行", () => {
    const walking = buildTimetable(
      gtfsFiles(
        [
          {
            id: "M1",
            line: "MT",
            headsign: "A",
            stops: [
              ["P1", "08:00"],
              ["A", "08:10"],
            ],
          },
          {
            id: "I1",
            line: "IS",
            headsign: "Z",
            stops: [
              ["B", "08:15"],
              ["Z", "08:25"],
            ],
          },
        ],
        [{ from: "A", to: "B", seconds: 180 }],
      ),
    );

    it("前一段晚到：步行跟着往后推；走到时下一班车已经开走，标出换乘可能赶不上", () => {
      const [planned] = planJourneys(walking, { from: "P1", to: "Z", departAfter: at("07:55") });

      const live = applyRealtime(
        planned!,
        new Map([realtime("survival:SURC:MT:T:M1", { A: { arrival: "08:20" } })]),
        dayStart,
      );

      expect(live.legs[1]).toMatchObject({
        kind: "walk",
        live: { departure: at("08:20"), arrival: at("08:23") },
      });
      expect(live.riskyChange).toBe(true);
    });

    it("步行之后的车晚点：步行时间仍够，不算赶不上", () => {
      const [planned] = planJourneys(walking, { from: "P1", to: "Z", departAfter: at("07:55") });

      const live = applyRealtime(
        planned!,
        new Map([
          realtime("survival:SURC:MT:T:M1", { A: { arrival: "08:12" } }),
          realtime("survival:SURC:IS:T:I1", { B: { departure: "08:16" } }),
        ]),
        dayStart,
      );

      expect(live.riskyChange).toBe(false);
    });

    it("先步行再坐车：第一班车晚点，出门时刻跟着往后推", () => {
      const [planned] = planJourneys(walking, { from: "A", to: "Z", departAfter: at("08:00") });

      const live = applyRealtime(
        planned!,
        new Map([realtime("survival:SURC:IS:T:I1", { B: { departure: "08:18" } })]),
        dayStart,
      );

      expect(live.legs[0]).toMatchObject({
        kind: "walk",
        live: { departure: at("08:15"), arrival: at("08:18") },
      });
      expect(live.live.departure).toBe(at("08:15"));
      expect(live.riskyChange).toBe(false);
    });
  });

  it("直通车：到达站在后一段车次里，也能取到实时到达", () => {
    const through = buildTimetable(
      gtfsFiles([
        {
          id: "D1",
          line: "MT",
          headsign: "Q",
          stops: [
            ["P1", "08:00"],
            ["X", "08:10"],
          ],
        },
        {
          id: "D1",
          leg: 2,
          line: "WS",
          owner: "MT",
          headsign: "Q",
          stops: [
            ["X", "08:10"],
            ["Q", "08:20"],
          ],
        },
      ]),
    );
    const [ride] = planJourneys(through, { from: "P1", to: "Q", departAfter: at("07:55") });

    const live = applyRealtime(
      ride!,
      new Map([realtime("survival:SURC:MT:T:D1~2", { Q: { arrival: "08:23" } })]),
      dayStart,
    );

    expect(live.live.arrival).toBe(at("08:23"));
  });
});

describe("liveJourneys", () => {
  const line = buildTimetable(
    gtfsFiles(
      ["M1", "M2", "M3"].map((id, i) => ({
        id,
        line: "MT",
        headsign: "P2",
        stops: [
          ["P1", `08:0${i * 3}`],
          ["P2", `08:1${i * 3}`],
        ] as [string, string][],
      })),
    ),
  );

  it("晚点还没开的车照样列出、按预计出发排序；准点已开走与取消的不列", () => {
    const journeys = liveJourneys(
      line,
      { from: "P1", to: "P2", departAfter: at("08:04"), count: 3 },
      new Map([
        realtime("survival:SURC:MT:T:M1", { P1: { departure: "08:08" } }, { delaySeconds: 480 }),
        realtime("survival:SURC:MT:T:M2", {}, { cancelled: true }),
      ]),
      dayStart,
    );

    expect(journeys.map((j) => [j.live.departure, j.departure])).toEqual([
      [at("08:06"), at("08:06")],
      [at("08:08"), at("08:00")],
    ]);
  });

  it("车次的预计出发已经过了（实时比整车晚点早开）时不列", () => {
    const journeys = liveJourneys(
      line,
      { from: "P1", to: "P2", departAfter: at("08:04"), count: 3 },
      new Map([
        realtime("survival:SURC:MT:T:M1", { P1: { departure: "08:03" } }, { delaySeconds: 480 }),
      ]),
      dayStart,
    );

    expect(journeys.map((j) => j.departure)).toEqual([at("08:06")]);
  });
});

describe("findJourney", () => {
  const line = buildTimetable(
    gtfsFiles([
      {
        id: "M1",
        line: "MT",
        headsign: "P2",
        stops: [
          ["P1", "08:00"],
          ["P2", "08:10"],
        ],
      },
      {
        id: "M2",
        line: "MT",
        headsign: "P2",
        stops: [
          ["P1", "08:06"],
          ["P2", "08:16"],
        ],
      },
    ]),
  );
  const route = { from: "P1", to: "P2" };

  it("坐的车被后面的快车追上、同时到达：照样找回坐的这一班（不然乘车 GO 会突然「找不到这个班次」）", () => {
    const overtaken = buildTimetable(
      gtfsFiles([
        {
          id: "L1",
          line: "MT",
          headsign: "P3",
          stops: [
            ["P1", "08:00"],
            ["P2", "08:10"],
            ["P3", "08:20"],
          ],
        },
        {
          id: "E1",
          line: "MT",
          headsign: "P3",
          stops: [
            ["P1", "08:05"],
            ["P3", "08:20"],
          ],
        },
      ]),
    );
    const found = findJourney(
      overtaken,
      { from: "P1", to: "P3", departure: at("08:00"), tripId: "survival:SURC:MT:T:L1" },
      new Map(),
      dayStart,
    );
    expect(found.journey?.departure).toBe(at("08:00"));
  });

  it("按出发时刻与第一段车次找回选中的方案", () => {
    const found = findJourney(
      line,
      { ...route, departure: at("08:06"), tripId: "survival:SURC:MT:T:M2" },
      new Map(),
      dayStart,
    );

    expect(found.cancelled).toBe(false);
    expect(found.journey?.departure).toBe(at("08:06"));
  });

  it("选中的车取消了：说明取消，不拿下一班顶替", () => {
    const found = findJourney(
      line,
      { ...route, departure: at("08:00"), tripId: "survival:SURC:MT:T:M1" },
      new Map([realtime("survival:SURC:MT:T:M1", {}, { cancelled: true })]),
      dayStart,
    );

    expect(found).toEqual({ journey: undefined, cancelled: true });
  });

  it("时刻表里没有这个方案（车次对不上）时找不到", () => {
    const found = findJourney(
      line,
      { ...route, departure: at("08:00"), tripId: "survival:SURC:MT:T:M9" },
      new Map(),
      dayStart,
    );

    expect(found).toEqual({ journey: undefined, cancelled: false });
  });
});
