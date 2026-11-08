import { describe, expect, it } from "vitest";
import { planJourneys } from "./planner.ts";
import { at, gtfsFiles } from "./testTimetable.ts";
import { buildTimetable, withHubTransfers } from "./timetable.ts";

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

    const [journey] = planJourneys(timetable, {
      from: "TST:P1",
      to: "TST:P3",
      departAfter: at("08:03"),
    });

    expect(journey?.departure).toBe(at("08:10"));
    expect(journey?.arrival).toBe(at("08:20"));
    expect(journey?.legs).toMatchObject([
      { kind: "ride", lineCode: "MT", from: "TST:P1", to: "TST:P3", headsign: "P3", stops: 2 },
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

    const [journey] = planJourneys(timetable, {
      from: "TST:P1",
      to: "TST:P4",
      departAfter: at("07:58"),
    });

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

    const [journey] = planJourneys(timetable, {
      from: "TST:P1",
      to: "TST:Q",
      departAfter: at("07:55"),
    });

    expect(journey?.legs).toMatchObject([
      { kind: "ride", lineCode: "MT", from: "TST:P1", to: "TST:X" },
      { kind: "ride", lineCode: "WS", from: "TST:X", to: "TST:Q", departure: at("08:13") },
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

    const [journey] = planJourneys(timetable, {
      from: "TST:P1",
      to: "TST:Q",
      departAfter: at("07:55"),
    });

    expect(journey?.legs).toMatchObject([
      {
        kind: "ride",
        lineCode: "MT",
        lineCodes: ["MT", "WS"],
        from: "TST:P1",
        to: "TST:Q",
        stops: 2,
      },
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

    const [journey] = planJourneys(timetable, {
      from: "TST:P1",
      to: "TST:Z",
      departAfter: at("07:55"),
    });

    expect(journey?.legs).toMatchObject([
      { kind: "ride", lineCode: "MT", from: "TST:P1", to: "TST:A" },
      { kind: "walk", from: "TST:A", to: "TST:B", seconds: 180 },
      { kind: "ride", lineCode: "IS", from: "TST:B", to: "TST:Z", departure: at("08:14") },
    ]);
  });

  it("步行到站比乘车晚到，但不用再留换乘时间：仍能赶上紧接着开的车", () => {
    const timetable = buildTimetable(
      gtfsFiles(
        [
          // 坐 R1 08:10 到 B，要留 2 分钟换乘，赶不上 08:11:30 的 T1。
          {
            id: "R1",
            line: "MT",
            headsign: "B",
            stops: [
              ["P1", "08:00"],
              ["B", "08:10"],
            ],
          },
          // 坐 R2 到 A，步行 6 分钟 08:11 到 B，步行时间已经包含换乘，能赶上 T1。
          {
            id: "R2",
            line: "WS",
            headsign: "A",
            stops: [
              ["P1", "08:01"],
              ["A", "08:05"],
            ],
          },
          {
            id: "T1",
            line: "IS",
            headsign: "Z",
            stops: [
              ["B", "08:11:30"],
              ["Z", "08:20"],
            ],
          },
          {
            id: "T2",
            line: "IS",
            headsign: "Z",
            stops: [
              ["B", "08:30"],
              ["Z", "08:40"],
            ],
          },
        ],
        [{ from: "A", to: "B", seconds: 360 }],
      ),
    );

    const [journey] = planJourneys(timetable, {
      from: "TST:P1",
      to: "TST:Z",
      departAfter: at("07:55"),
    });

    expect(journey?.arrival).toBe(at("08:20"));
    expect(journey?.legs).toMatchObject([
      { kind: "ride", from: "TST:P1", to: "TST:A" },
      { kind: "walk", from: "TST:A", to: "TST:B", departure: at("08:05"), arrival: at("08:11") },
      { kind: "ride", from: "TST:B", to: "TST:Z", tripId: "survival:SURC:IS:T:T1" },
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
      from: "TST:P1",
      to: "TST:P4",
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
      from: "TST:A",
      to: "TST:Z",
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

  it("起终点之间只需步行：步行方案只列一次，不会每隔 1 秒重复", () => {
    const timetable = buildTimetable(
      gtfsFiles(
        [
          {
            id: "M1",
            line: "MT",
            headsign: "B",
            stops: [
              ["A", "08:00"],
              ["X", "08:10"],
              ["B", "08:20"],
            ],
          },
        ],
        [{ from: "A", to: "B", seconds: 180 }],
      ),
    );

    const journeys = planJourneys(timetable, {
      from: "TST:A",
      to: "TST:B",
      departAfter: at("07:55"),
      count: 6,
    });

    expect(journeys).toHaveLength(1);
    expect(journeys[0]).toMatchObject({
      departure: at("07:55"),
      arrival: at("07:58"),
      legs: [{ kind: "walk", from: "TST:A", to: "TST:B", seconds: 180 }],
    });
  });

  it("步行与乘车都能到：列出比步行快的车，步行方案只列一次", () => {
    const timetable = buildTimetable(
      gtfsFiles(
        [
          {
            id: "E1",
            line: "MT",
            headsign: "B",
            stops: [
              ["A", "08:01"],
              ["B", "08:03"],
            ],
          },
          {
            id: "E2",
            line: "MT",
            headsign: "B",
            stops: [
              ["A", "08:20"],
              ["B", "08:22"],
            ],
          },
        ],
        [{ from: "A", to: "B", seconds: 600 }],
      ),
    );

    const journeys = planJourneys(timetable, {
      from: "TST:A",
      to: "TST:B",
      departAfter: at("08:00"),
      count: 6,
    });

    expect(journeys.map((j) => [j.legs.map((l) => l.kind), j.departure])).toEqual([
      [["ride"], at("08:01")],
      [["walk"], at("08:01:01")],
      [["ride"], at("08:20")],
    ]);
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

    const [late] = planJourneys(timetable, {
      from: "TST:P1",
      to: "TST:P2",
      departAfter: at("23:58"),
    });
    const [early] = planJourneys(timetable, {
      from: "TST:P1",
      to: "TST:P2",
      departAfter: at("00:03"),
    });

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

    expect(
      planJourneys(timetable, { from: "TST:P1", to: "TST:Q2", departAfter: at("07:00") }),
    ).toEqual([]);
    expect(
      planJourneys(timetable, { from: "TST:P1", to: "TST:P2", departAfter: at("09:00") }),
    ).toEqual([]);
  });

  it("晚点的车按时刻表已经开出、实际还没开：仍列出，按预计出发排序；准点开走的不列", () => {
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
          id: "M0",
          line: "MT",
          headsign: "P2",
          stops: [
            ["P1", "08:02"],
            ["P2", "08:12"],
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

    const journeys = planJourneys(timetable, {
      from: "TST:P1",
      to: "TST:P2",
      departAfter: at("08:05"),
      count: 3,
      delays: new Map([["survival:SURC:MT:T:M1", 600]]),
    });

    expect(journeys.map((j) => j.legs[0]?.kind === "ride" && j.legs[0].tripId)).toEqual([
      "survival:SURC:MT:T:M2",
      "survival:SURC:MT:T:M1",
    ]);
  });

  it("坐晚点的车去换乘：按时刻表衔接、但实际已经开走的车不用", () => {
    const timetable = buildTimetable(
      gtfsFiles([
        {
          id: "D1",
          line: "MT",
          headsign: "X",
          stops: [
            ["P1", "07:58"],
            ["X", "08:02"],
          ],
        },
        {
          id: "W1",
          line: "WS",
          headsign: "Q",
          stops: [
            ["X", "08:04"],
            ["Q", "08:10"],
          ],
        },
        {
          id: "W2",
          line: "WS",
          headsign: "Q",
          stops: [
            ["X", "08:20"],
            ["Q", "08:26"],
          ],
        },
      ]),
    );

    const [journey] = planJourneys(timetable, {
      from: "TST:P1",
      to: "TST:Q",
      departAfter: at("08:05"),
      delays: new Map([["survival:SURC:MT:T:D1", 600]]),
    });

    expect(journey?.legs.map((l) => l.kind === "ride" && l.tripId)).toEqual([
      "survival:SURC:MT:T:D1",
      "survival:SURC:WS:T:W2",
    ]);
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
      from: "TST:P1",
      to: "TST:P2",
      departAfter: at("07:55"),
      cancelledTrips: new Set(["survival:SURC:MT:T:M1"]),
    });

    expect(journey?.departure).toBe(at("08:06"));
  });

  describe("站内换乘时间按车站取", () => {
    // P1 坐 MT 08:10 到 X；X 换 WS：08:11 一班（只差 1 分钟）、08:20 一班。
    const trips = [
      {
        id: "M1",
        line: "MT",
        headsign: "X",
        stops: [
          ["P1", "08:00"],
          ["X", "08:10"],
        ] as [string, string][],
      },
      {
        id: "W1",
        line: "WS",
        headsign: "Q",
        stops: [
          ["X", "08:11"],
          ["Q", "08:20"],
        ] as [string, string][],
      },
      {
        id: "W2",
        line: "WS",
        headsign: "Q",
        stops: [
          ["X", "08:20"],
          ["Q", "08:29"],
        ] as [string, string][],
      },
    ];
    const plan = (options: Parameters<typeof gtfsFiles>[2]) =>
      planJourneys(buildTimetable(gtfsFiles(trips, [], options)), {
        from: `${options?.operator}:P1`,
        to: `${options?.operator}:Q`,
        departAfter: at("07:55"),
      })[0];

    it("SURC（TramTrain，车站小）站内换乘 1 分钟就够：赶得上 08:11 的车", () => {
      const journey = plan({ operator: "SURC" });
      expect(journey?.arrival).toBe(at("08:20"));
      // 记在下车的那一段上，乘坐指南与「换乘可能赶不上」都按它判断。
      expect(journey?.legs[0]).toMatchObject({ kind: "ride", changeSeconds: 60 });
    });

    it("其他运营方仍按 2 分钟", () => {
      expect(plan({ operator: "PUAT" })?.arrival).toBe(at("08:29"));
    });

    it("GTFS 换乘表里写了同站的最短换乘时间时以它为准", () => {
      expect(
        plan({ operator: "SURC", minTransfers: [{ station: "X", seconds: 180 }] })?.arrival,
      ).toBe(at("08:29"));
      expect(
        plan({ operator: "PUAT", minTransfers: [{ station: "X", seconds: 60 }] })?.arrival,
      ).toBe(at("08:20"));
    });
  });

  describe("枢纽：两家运营方的车站合成一个站", () => {
    // TST 的车 P1 → H 08:10 到；OTH 的车从它自己的 H 开出，站码碰巧相同，但是另一个车站。
    const files = gtfsFiles([
      {
        id: "T1",
        line: "MT",
        headsign: "H",
        stops: [
          ["P1", "08:00"],
          ["H", "08:10"],
        ],
      },
      ...["08:11", "08:12", "08:20"].map((time, i) => ({
        id: `S${i}`,
        line: "SM",
        headsign: "Z",
        operator: "OTH",
        stops: [
          ["H", time],
          ["Z", `08:${25 + i}`],
        ] as [string, string][],
      })),
    ]);
    const hub = [{ stations: ["TST:H", "OTH:H"] }];

    it("站码相同的两个车站不会被当成同一个站", () => {
      const timetable = buildTimetable(files);
      expect(
        planJourneys(timetable, { from: "TST:P1", to: "OTH:Z", departAfter: at("07:55") }),
      ).toEqual([]);
    });

    it("枢纽里换另一家：站内换乘 90 秒，赶不上 08:11、坐 08:12 的车；乘车段记下运营方", () => {
      const timetable = withHubTransfers(buildTimetable(files), hub);
      const [journey] = planJourneys(timetable, {
        from: "TST:P1",
        to: "OTH:Z",
        departAfter: at("07:55"),
      });
      expect(journey?.legs).toMatchObject([
        { kind: "ride", operatorCode: "TST", from: "TST:P1", to: "TST:H" },
        { kind: "walk", inStation: true, from: "TST:H", to: "OTH:H", seconds: 90 },
        { kind: "ride", operatorCode: "OTH", from: "OTH:H", to: "OTH:Z", departure: at("08:12") },
      ]);
    });

    it("API 给了换乘时间时用它", () => {
      const timetable = withHubTransfers(buildTimetable(files), [{ ...hub[0]!, seconds: 30 }]);
      const [journey] = planJourneys(timetable, {
        from: "TST:P1",
        to: "OTH:Z",
        departAfter: at("07:55"),
      });
      expect(journey?.legs[2]).toMatchObject({ departure: at("08:11") });
    });

    it("从枢纽出发：任一成员站都是起点，直接坐另一家的车，不用先换乘", () => {
      const timetable = withHubTransfers(buildTimetable(files), hub);
      const [journey] = planJourneys(timetable, {
        from: ["TST:H", "OTH:H"],
        to: "OTH:Z",
        departAfter: at("08:05"),
      });
      expect(journey?.legs).toMatchObject([
        { kind: "ride", from: "OTH:H", departure: at("08:11") },
      ]);
    });

    it("到枢纽：到了任一成员站就算到了，不再换乘", () => {
      const timetable = withHubTransfers(buildTimetable(files), hub);
      const [journey] = planJourneys(timetable, {
        from: "TST:P1",
        to: ["TST:H", "OTH:H"],
        departAfter: at("07:55"),
      });
      expect(journey?.legs).toMatchObject([{ kind: "ride", to: "TST:H" }]);
      expect(journey?.arrival).toBe(at("08:10"));
    });
  });
});
