import { describe, expect, it } from "vitest";
import type { RailCatalog, RailStationLine, RailTrain } from "@/lib/railApi.ts";
import type { TripUpdate } from "@/lib/realtime.ts";
import { buildTrainDetail } from "./trainDetail.ts";

const now = Date.UTC(2026, 9, 31, 1, 0);
const minute = 60_000;

const mt: RailStationLine = {
  lineId: "survival:SURC:MT",
  operatorCode: "SURC",
  lineCode: "MT",
  lineName: "两港快线",
  color: "#D920D9",
};
const ws: RailStationLine = {
  lineId: "survival:SURC:WS",
  operatorCode: "SURC",
  lineCode: "WS",
  lineName: "西南线",
  color: "#2E8B57",
};

const names: Record<string, string> = {
  PPK: "蒲塘桥港",
  RVS: "河滨道",
  PTK: "蒲塘桥",
  SPB: "南浦桥",
  WSD: "西沙洲",
  SCC: "圣城",
  ZKW: "竹客湾",
  HHU: "新笛矢·壑湖",
  LWN: "绿湾",
  DPB: "笛浦湾",
  TPC: "塔坪",
  NTA: "南渡",
};
const wsStations = new Set(["HHU", "LWN", "DPB", "TPC", "NTA"]);
const mtStations = new Set(["PPK", "RVS", "PTK", "SPB", "WSD", "SCC", "ZKW", "HHU"]);

const catalog: RailCatalog = {
  schemaVersion: 1,
  generatedAt: "",
  state: "healthy",
  sources: [],
  operators: [{ id: "survival:SURC", serverId: "survival", code: "SURC", name: "SURC" }],
  lines: [],
  stations: Object.entries(names).map(([code, name]) => ({
    id: `survival:SURC:${code}`,
    serverId: "survival",
    operatorId: "survival:SURC",
    code,
    name,
    lines: [...(mtStations.has(code) ? [mt] : []), ...(wsStations.has(code) ? [ws] : [])],
  })),
};

/** 普通车往壑湖方向站站停。 */
const localStops = ["PPK", "RVS", "PTK", "SPB", "WSD", "SCC", "ZKW", "HHU"];
/** 快车往南渡：不停河滨道、圣城，在壑湖起直通西南线。 */
const expressStops = ["PPK", "PTK", "SPB", "WSD", "ZKW", "HHU", "LWN", "DPB", "TPC", "NTA"];
const expressLines = ["MT", "MT", "MT", "MT", "MT", "WS", "WS", "WS", "WS", "WS"];

function train(overrides: Partial<RailTrain>): RailTrain {
  return {
    serverId: "survival",
    name: "SURC-MT-LH-0001",
    operatorCode: "SURC",
    lineCode: "MT",
    routeCode: "SURC:MT:MT-2O_ShortD",
    inService: true,
    speedBlocksPerSecond: 8,
    updatedAt: "",
    ...overrides,
  };
}

function detail(overrides: Partial<Parameters<typeof buildTrainDetail>[0]> & { train: RailTrain }) {
  return buildTrainDetail({
    line: mt,
    serverId: "survival",
    homeStationCode: "WSD",
    routeStops: localStops,
    catalog,
    now,
    ...overrides,
  });
}

describe("buildTrainDetail：位置", () => {
  it("两个节点都在同一区间里时，区间方向按交路站序（节点名不表示方向）", () => {
    // 区间节点写作「南浦桥:蒲塘桥」，但这趟车往壑湖方向开，是从蒲塘桥驶向南浦桥。
    const d = detail({
      train: train({ currentNode: "SURC:SPB:PTK:2:001", nextNode: "SURC:SPB:PTK:2:002" }),
    });
    expect(d.section).toEqual({ from: "蒲塘桥", to: "南浦桥" });
    expect(d.stops[d.position.afterIndex]?.code).toBe("PTK");
    expect(d.position.dwelling).toBe(false);
  });

  it("停在停靠站上：位置画在这一站，之前的站只留最后一个已过站", () => {
    const d = detail({
      train: train({
        currentNode: "SURC:S:PTK:2",
        nextNode: "SURC:PTK:SPB:2:001",
        speedBlocksPerSecond: 0,
      }),
    });
    expect(d.section).toEqual({ at: "蒲塘桥" });
    expect(d.stops.map((s) => [s.code, s.kind])).toEqual([
      ["RVS", "passed"],
      ["PTK", "stop"],
      ["SPB", "stop"],
      ["WSD", "here"],
      ["SCC", "stop"],
      ["ZKW", "stop"],
      ["HHU", "end"],
    ]);
    expect(d.position).toEqual({ afterIndex: 1, dwelling: true });
  });

  it("快车在不停的站上停下时不算停靠，位置在前后两个停靠站之间", () => {
    const d = detail({
      train: train({
        routeCode: "SURC:MT:MT-3O_DPExp",
        currentNode: "SURC:S:SCC:1",
        nextNode: "SURC:S:ZKW:1",
        speedBlocksPerSecond: 0,
      }),
      routeStops: expressStops,
      routeStopLines: expressLines,
      homeStationCode: "SCC",
    });
    expect(d.section).toEqual({ from: "圣城", to: "竹客湾" });
    expect(d.position.dwelling).toBe(false);
    expect(d.stops[d.position.afterIndex]?.code).toBe("WSD");
    expect(d.notStopping).toBe("圣城");
    expect(d.here).toBeUndefined();
  });
});

describe("buildTrainDetail：跨线直通", () => {
  it("已经直通到另一条线时，详情标题用列车当前所在的线路，而不是看板的线路", () => {
    // 看板在蒲塘桥（只有两港快线），列车已在壑湖转入西南线，正驶向绿湾。
    const d = detail({
      train: train({
        lineCode: "WS",
        routeCode: "SURC:MT:MT-3O_DPExp",
        currentNode: "SURC:S:HHU:2",
        nextNode: "SURC:HHU:LWN:2:001",
      }),
      line: mt,
      routeStops: expressStops,
      routeStopLines: expressLines,
      homeStationCode: "PTK",
    });
    expect(d.line.lineCode).toBe("WS");
    expect(d.throughAt).toEqual([]);
  });

  it("没有交路站序时，按当前站在 catalog 里的线路找出列车所在线路", () => {
    const d = detail({
      train: train({
        lineCode: "WS",
        routeCode: undefined,
        currentNode: "SURC:S:LWN:2",
        nextNode: "SURC:S:DPB:2",
      }),
      line: mt,
      routeStops: undefined,
      homeStationCode: "PTK",
    });
    expect(d.line.lineCode).toBe("WS");
  });

  it("前方要直通时列出换线站与线路", () => {
    const d = detail({
      train: train({
        routeCode: "SURC:MT:MT-3O_DPExp",
        currentNode: "SURC:S:SPB:1",
        nextNode: "SURC:S:WSD:1",
      }),
      routeStops: expressStops,
      routeStopLines: expressLines,
    });
    expect(d.line.lineCode).toBe("MT");
    expect(d.throughAt.map((t) => [t.stationName, t.line.lineCode])).toEqual([
      ["新笛矢·壑湖", "WS"],
    ]);
  });
});

describe("buildTrainDetail：时刻与晚点", () => {
  it("本站的预计到达时刻与晚点来自行程更新，原定时刻减去晚点", () => {
    const tripUpdate: TripUpdate = {
      trainName: "SURC-MT-LH-0001",
      tripId: "t",
      delaySeconds: 360,
      stops: [
        { stationCode: "PTK", arrival: now - minute, departure: now - minute / 2 },
        { stationCode: "SPB", arrival: now + 2 * minute, departure: now + 3 * minute },
        { stationCode: "WSD", arrival: now + 5 * minute, departure: now + 6 * minute },
      ],
    };
    const d = detail({
      train: train({ currentNode: "SURC:S:PTK:2", nextNode: "SURC:PTK:SPB:2:001" }),
      tripUpdate,
    });
    expect(d.delayMinutes).toBe(6);
    expect(d.here).toEqual({
      stationName: "西沙洲",
      time: now + 5 * minute,
      planned: now - minute,
      platform: undefined,
      atStation: false,
    });
    expect(d.stops.find((s) => s.code === "SPB")?.time).toBe(now + 2 * minute);
  });
});
