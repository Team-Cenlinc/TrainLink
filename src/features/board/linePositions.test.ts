import { describe, expect, it } from "vitest";
import type { RailCatalog, RailStationLine, RailTrain } from "@/lib/railApi.ts";
import { buildLineLayout } from "./linePositions.ts";

/** 两港快线的站序（与 GTFS 里最长的车次一致）。 */
const order = ["HHU", "ZKW", "SCC", "WSD", "SPB", "PTK", "RVS", "PPK"];
const names: Record<string, string> = {
  HHU: "新笛矢·壑湖",
  ZKW: "竹客湾",
  SCC: "圣城",
  WSD: "西沙洲",
  SPB: "南浦桥",
  PTK: "蒲塘桥",
  RVS: "河滨道",
  PPK: "蒲塘桥港",
};

const mt: RailStationLine = {
  lineId: "survival:SURC:MT",
  operatorCode: "SURC",
  lineCode: "MT",
  lineName: "两港快线",
  color: "#D920D9",
};

const catalog: RailCatalog = {
  schemaVersion: 1,
  generatedAt: "",
  state: "healthy",
  sources: [],
  operators: [{ id: "survival:SURC", serverId: "survival", code: "SURC", name: "SURC" }],
  lines: [],
  stations: order.map((code) => ({
    id: `survival:SURC:${code}`,
    serverId: "survival",
    operatorId: "survival:SURC",
    code,
    name: names[code]!,
    lines: [mt],
  })),
};

/** 交路站序：普通车站站停，快车不停圣城、河滨道。 */
const routeStops = new Map([
  ["SURC:MT:MT-2F_Short", order],
  ["SURC:MT:MT-2O_ShortD", [...order].reverse()],
  ["SURC:MT:MT-3N_DPExp", ["HHU", "ZKW", "WSD", "SPB", "PTK", "PPK"]],
]);
const headsigns = new Map([
  ["SURC:MT:MT-2F_Short", "蒲塘桥港"],
  ["SURC:MT:MT-2O_ShortD", "新笛矢·壑湖"],
  ["SURC:MT:MT-3N_DPExp", "蒲塘桥港"],
]);

function train(overrides: Partial<RailTrain>): RailTrain {
  return {
    serverId: "survival",
    name: "SURC-MT-LP-0001",
    operatorCode: "SURC",
    lineCode: "MT",
    routeCode: "SURC:MT:MT-2F_Short",
    inService: true,
    speedBlocksPerSecond: 8,
    updatedAt: "",
    ...overrides,
  };
}

function layout(trains: RailTrain[], extra: { catalog?: RailCatalog } = {}) {
  return buildLineLayout({
    order,
    line: mt,
    serverId: "survival",
    stationCode: "PTK",
    trains,
    headsigns,
    routeStops,
    departures: [],
    catalog,
    ...extra,
  });
}

/** 只看位置与方向。 */
const placeOf = (trains: RailTrain[], extra?: { catalog?: RailCatalog }) =>
  layout(trains, extra).trains.map((t) => [t.slot, t.direction]);

describe("buildLineLayout：列车位置", () => {
  it("刚离开车站、下一节点是区间时，画在这一站与前方站之间", () => {
    // 往壑湖方向（站序变小），刚从蒲塘桥开出，下一节点是蒲塘桥—南浦桥区间。
    const place = placeOf([
      train({
        routeCode: "SURC:MT:MT-2O_ShortD",
        currentNode: "SURC:S:PTK:2",
        nextNode: "SURC:PTK:SPB:2:001",
      }),
    ]);
    expect(place).toEqual([[4.5, "toStart"]]);
  });

  it("从区间驶向车站时，画在上一站与这一站之间，而不是已经停在这一站", () => {
    // 往港口方向，在竹客湾—壑湖区间里，下一节点是竹客湾。
    const place = placeOf([train({ currentNode: "SURC:ZKW:HHU:1:002", nextNode: "SURC:S:ZKW:1" })]);
    expect(place).toEqual([[0.5, "toEnd"]]);
  });

  it("当前与下一节点都是同一区间的节点时不丢掉，方向按交路站序", () => {
    // 区间节点名是「蒲塘桥:南浦桥」，但这趟车往壑湖方向开：从蒲塘桥驶向南浦桥。
    const place = placeOf([
      train({
        routeCode: "SURC:MT:MT-2O_ShortD",
        currentNode: "SURC:PTK:SPB:2:001",
        nextNode: "SURC:PTK:SPB:2:002",
      }),
    ]);
    expect(place).toEqual([[4.5, "toStart"]]);
  });

  it("下一节点换到相邻区间时，以两个区间共有的站为前方", () => {
    const place = placeOf([
      train({
        routeCode: undefined,
        currentNode: "SURC:WSD:SPB:1:003",
        nextNode: "SURC:SPB:PTK:1:001",
      }),
    ]);
    expect(place).toEqual([[3.5, "toEnd"]]);
  });

  it("快车跨过不停的站时，不画在那一站上", () => {
    // 竹客湾直接到西沙洲（走越行线，不经圣城的车站节点），中点正好是圣城。
    const [place] = placeOf([
      train({
        routeCode: "SURC:MT:MT-3N_DPExp",
        currentNode: "SURC:S:ZKW:1",
        nextNode: "SURC:S:WSD:1",
      }),
    ]);
    expect(place?.[1]).toBe("toEnd");
    expect(Number.isInteger(place?.[0])).toBe(false);
    expect(place?.[0]).toBeGreaterThan(1);
    expect(place?.[0]).toBeLessThan(3);
  });

  it("快车在不停的站上停下（等信号）时，画在区间里，与列车详情一致", () => {
    const place = placeOf([
      train({
        routeCode: "SURC:MT:MT-3N_DPExp",
        currentNode: "SURC:S:RVS:1",
        nextNode: "SURC:PPK:RVS:1:001",
        speedBlocksPerSecond: 0,
      }),
    ]);
    expect(place).toEqual([[6.5, "toEnd"]]);
  });

  it("停在停靠站上时画在这一站", () => {
    const place = placeOf([
      train({ currentNode: "SURC:S:WSD:1", nextNode: "SURC:S:SPB:1", speedBlocksPerSecond: 0 }),
    ]);
    expect(place).toEqual([[3, "toEnd"]]);
  });

  it("停在终点、没有下一节点时画在终点站，方向按交路", () => {
    const place = placeOf([train({ currentNode: "SURC:S:PPK:1", speedBlocksPerSecond: 0 })]);
    expect(place).toEqual([[7, "toEnd"]]);
  });
});

describe("buildLineLayout：方向", () => {
  it("没有终点站名时，不会和 catalog 里查不到的站「同名」而分到往第一站方向", () => {
    // 壑湖不在 catalog 里；列车没有交路，也就没有终点与站序。
    const partial = { ...catalog, stations: catalog.stations.filter((s) => s.code !== "HHU") };
    const place = placeOf(
      [train({ routeCode: undefined, currentNode: "SURC:S:SPB:1", speedBlocksPerSecond: 0 })],
      { catalog: partial },
    );
    expect(place).toEqual([[4, "toEnd"]]);
  });

  it("没有交路站序时按终点站名判断方向", () => {
    const place = buildLineLayout({
      order,
      line: mt,
      serverId: "survival",
      stationCode: "PTK",
      trains: [
        train({
          routeCode: "SURC:MT:MT-2O_ShortD",
          currentNode: "SURC:S:SPB:2",
          speedBlocksPerSecond: 0,
        }),
      ],
      headsigns,
      departures: [],
      catalog,
    }).trains.map((t) => [t.slot, t.direction]);
    expect(place).toEqual([[4, "toStart"]]);
  });
});

describe("buildLineLayout：车站与列车信息", () => {
  it("站名来自 catalog，标出本站与可换乘的其他线路", () => {
    const ws: RailStationLine = { ...mt, lineId: "survival:SURC:WS", lineCode: "WS" };
    const withTransfer = {
      ...catalog,
      stations: catalog.stations.map((s) => (s.code === "HHU" ? { ...s, lines: [mt, ws] } : s)),
    };
    const { stops } = layout([], { catalog: withTransfer });
    expect(stops[0]).toEqual({ code: "HHU", name: "新笛矢·壑湖", current: false, transfers: [ws] });
    expect(stops.filter((s) => s.current).map((s) => s.code)).toEqual(["PTK"]);
  });

  it("只放这条线、在运营中的列车", () => {
    const { trains } = layout([
      train({ name: "a", currentNode: "SURC:S:WSD:1" }),
      train({ name: "b", currentNode: "SURC:S:WSD:1", lineCode: "WS" }),
      train({ name: "c", currentNode: "SURC:S:WSD:1", inService: false }),
      train({ name: "d", currentNode: "SURC:D:HHU:1:001" }),
    ]);
    expect(trains.map((t) => t.name)).toEqual(["a"]);
  });

  it("晚点与车厢拥挤度：车辆位置优先，没有时用本站站牌", () => {
    const { trains } = buildLineLayout({
      order,
      line: mt,
      serverId: "survival",
      stationCode: "PTK",
      trains: [
        train({ name: "a", currentNode: "SURC:S:WSD:1" }),
        train({ name: "b", currentNode: "SURC:S:SPB:1" }),
      ],
      headsigns,
      routeStops,
      departures: [
        {
          line: "MT",
          routeId: "SURC:MT:MT-2F_Short",
          destination: "",
          platform: "1",
          status: "",
          phase: "EN_ROUTE",
          passing: false,
          terminating: false,
          inService: true,
          train: "b",
          delaySeconds: 125,
          cars: [
            { seats: 10, occupied: 1 },
            { seats: 10, occupied: 9 },
          ],
        },
      ],
      carLoads: new Map([["a", [0.5]]]),
      catalog,
    });
    expect(trains.map((t) => [t.name, t.cars, t.delayMinutes, t.headsign])).toEqual([
      ["a", ["medium"], undefined, "蒲塘桥港"],
      ["b", ["low", "high"], 2, "蒲塘桥港"],
    ]);
  });
});
