import { describe, expect, it } from "vitest";
import { planJourneys } from "./planner.ts";
import { at, gtfsFiles } from "./testTimetable.ts";
import { buildTimetable } from "./timetable.ts";

describe("planJourneys", () => {
  it("直达：给出出发时刻之后最早的一班，起止时刻与乘车段", () => {
    const timetable = buildTimetable(
      gtfsFiles([
        {
          id: "L1",
          line: "MT",
          headsign: "P3",
          stops: [
            ["P1", "08:00"],
            ["P2", "08:05"],
            ["P3", "08:10"],
          ],
        },
        {
          id: "L2",
          line: "MT",
          headsign: "P3",
          stops: [
            ["P1", "08:10"],
            ["P2", "08:15"],
            ["P3", "08:20"],
          ],
        },
      ]),
    );

    const [journey] = planJourneys(timetable, { from: "P1", to: "P3", departAfter: at("08:03") });

    expect(journey?.departure).toBe(at("08:10"));
    expect(journey?.arrival).toBe(at("08:20"));
    expect(journey?.legs).toMatchObject([
      { kind: "ride", lineCode: "MT", from: "P1", to: "P3", headsign: "P3", stops: 2 },
    ]);
  });

  it("后开先到的快车优先：给出到达最早的方案", () => {
    const timetable = buildTimetable(
      gtfsFiles([
        {
          id: "L1",
          line: "MT",
          headsign: "P4",
          stops: [
            ["P1", "08:00"],
            ["P2", "08:05"],
            ["P3", "08:10"],
            ["P4", "08:15"],
          ],
        },
        {
          id: "E1",
          line: "MT",
          headsign: "P4",
          stops: [
            ["P1", "08:02"],
            ["P4", "08:10"],
          ],
        },
      ]),
    );

    const [journey] = planJourneys(timetable, { from: "P1", to: "P4", departAfter: at("07:58") });

    expect(journey?.legs.map((l) => l.kind === "ride" && l.tripId)).toEqual([
      "survival:SURC:MT:T:E1",
    ]);
    expect([journey?.departure, journey?.arrival]).toEqual([at("08:02"), at("08:10")]);
  });

  it("同站换乘至少留 2 分钟：只差 1 分钟的车赶不上，换下一班", () => {
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
            ["X", "08:11"],
            ["Q", "08:20"],
          ],
        },
        {
          id: "W2",
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

    expect(journey?.legs).toMatchObject([
      { kind: "ride", lineCode: "MT", from: "P1", to: "X" },
      { kind: "ride", lineCode: "WS", from: "X", to: "Q", departure: at("08:13") },
    ]);
    expect(journey?.arrival).toBe(at("08:22"));
  });

  it("跨线直通的两段是同一列车：算一段乘车，不算换乘，并记下经过的线路", () => {
    const timetable = buildTimetable(
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

    const [journey] = planJourneys(timetable, { from: "P1", to: "Q", departAfter: at("07:55") });

    expect(journey?.legs).toMatchObject([
      { kind: "ride", lineCode: "MT", lineCodes: ["MT", "WS"], from: "P1", to: "Q", stops: 2 },
    ]);
  });

  it("站外换乘：按 transfers.txt 的步行时间走到另一站再上车", () => {
    const timetable = buildTimetable(
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
              ["B", "08:12"],
              ["Z", "08:18"],
            ],
          },
          {
            id: "I2",
            line: "IS",
            headsign: "Z",
            stops: [
              ["B", "08:14"],
              ["Z", "08:20"],
            ],
          },
        ],
        [{ from: "A", to: "B", seconds: 180 }],
      ),
    );

    const [journey] = planJourneys(timetable, { from: "P1", to: "Z", departAfter: at("07:55") });

    expect(journey?.legs).toMatchObject([
      { kind: "ride", lineCode: "MT", from: "P1", to: "A" },
      { kind: "walk", from: "A", to: "B", seconds: 180 },
      { kind: "ride", lineCode: "IS", from: "B", to: "Z", departure: at("08:14") },
    ]);
  });

  it("给出几个方案，一个比一个晚出发；先出发却不先到的（被后车超越）不列", () => {
    const timetable = buildTimetable(
      gtfsFiles([
        {
          id: "L1",
          line: "MT",
          headsign: "P4",
          stops: [
            ["P1", "08:00"],
            ["P4", "08:20"],
          ],
        },
        {
          id: "E1",
          line: "MT",
          headsign: "P4",
          stops: [
            ["P1", "08:05"],
            ["P4", "08:15"],
          ],
        },
        {
          id: "L2",
          line: "MT",
          headsign: "P4",
          stops: [
            ["P1", "08:10"],
            ["P4", "08:30"],
          ],
        },
        {
          id: "E2",
          line: "MT",
          headsign: "P4",
          stops: [
            ["P1", "08:20"],
            ["P4", "08:28"],
          ],
        },
        {
          id: "L3",
          line: "MT",
          headsign: "P4",
          stops: [
            ["P1", "08:30"],
            ["P4", "08:45"],
          ],
        },
        {
          id: "E3",
          line: "MT",
          headsign: "P4",
          stops: [
            ["P1", "08:35"],
            ["P4", "08:45"],
          ],
        },
      ]),
    );

    const journeys = planJourneys(timetable, {
      from: "P1",
      to: "P4",
      departAfter: at("07:55"),
      count: 5,
    });

    expect(journeys.map((j) => [j.departure, j.arrival])).toEqual([
      [at("08:05"), at("08:15")],
      [at("08:20"), at("08:28")],
      [at("08:35"), at("08:45")],
    ]);
  });

  it("先步行再乘车的方案，按要赶的那班车倒推出发时刻（不用一出门就走）", () => {
    const timetable = buildTimetable(
      gtfsFiles(
        [
          {
            id: "I1",
            line: "IS",
            headsign: "Z",
            stops: [
              ["B", "08:20"],
              ["Z", "08:30"],
            ],
          },
          {
            id: "I2",
            line: "IS",
            headsign: "Z",
            stops: [
              ["B", "08:40"],
              ["Z", "08:50"],
            ],
          },
        ],
        [{ from: "A", to: "B", seconds: 180 }],
      ),
    );

    const journeys = planJourneys(timetable, {
      from: "A",
      to: "Z",
      departAfter: at("08:00"),
      count: 2,
    });

    expect(journeys[0]?.legs[0]).toMatchObject({
      kind: "walk",
      departure: at("08:17"),
      arrival: at("08:20"),
    });
    expect(journeys.map((j) => j.departure)).toEqual([at("08:17"), at("08:37")]);
  });

  it("过了午夜：前一运营日写成 24:05 的车，在 00:03 查询时就是 00:05 出发", () => {
    const timetable = buildTimetable(
      gtfsFiles([
        {
          id: "N1",
          line: "MT",
          headsign: "P2",
          stops: [
            ["P1", "24:05"],
            ["P2", "24:15"],
          ],
        },
        {
          id: "F1",
          line: "MT",
          headsign: "P2",
          stops: [
            ["P1", "06:00"],
            ["P2", "06:10"],
          ],
        },
      ]),
    );

    const [late] = planJourneys(timetable, { from: "P1", to: "P2", departAfter: at("23:58") });
    const [early] = planJourneys(timetable, { from: "P1", to: "P2", departAfter: at("00:03") });

    expect([late?.departure, late?.arrival]).toEqual([at("24:05"), at("24:15")]);
    expect([early?.departure, early?.arrival]).toEqual([at("00:05"), at("00:15")]);
  });

  it("没有车能到（不连通，或今天已经没车）时返回空列表", () => {
    const timetable = buildTimetable(
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
          id: "W1",
          line: "WS",
          headsign: "Q2",
          stops: [
            ["Q1", "08:00"],
            ["Q2", "08:10"],
          ],
        },
      ]),
    );

    expect(planJourneys(timetable, { from: "P1", to: "Q2", departAfter: at("07:00") })).toEqual([]);
    expect(planJourneys(timetable, { from: "P1", to: "P2", departAfter: at("09:00") })).toEqual([]);
  });

  it("已取消的车次不用，改坐下一班", () => {
    const timetable = buildTimetable(
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

    const [journey] = planJourneys(timetable, {
      from: "P1",
      to: "P2",
      departAfter: at("07:55"),
      cancelledTrips: new Set(["survival:SURC:MT:T:M1"]),
    });

    expect(journey?.departure).toBe(at("08:06"));
  });
});
