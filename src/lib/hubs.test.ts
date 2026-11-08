import { describe, expect, it } from "vitest";
import { hubKeys, hubLines, hubOf, hubOperators, hubTransfers, sameHub } from "./hubs.ts";
import type { RailCatalog, RailStation } from "./railApi.ts";

/** 与 2026-11 的 Survival 相同：JBS、PPK 两家合成枢纽，RVS–PHI 是出站换乘。 */
const station = (operator: string, code: string, name: string): RailStation => ({
  id: `survival:${operator}:${code}`,
  serverId: "survival",
  operatorId: `survival:${operator}`,
  code,
  name,
  lines: [],
});
const stations = [
  station("SURC", "JBS", "海侧约翰"),
  station("PUAT", "JBS", "海侧约翰"),
  station("SURC", "PPK", "蒲塘桥港"),
  station("PUAT", "PPK", "蒲塘桥港·单轨"),
  station("SURC", "RVS", "河滨道"),
  station("SURC", "PHI", "浦汇"),
  station("PUAT", "NKT", "北陆城北"),
];
const member = (operator: string, code: string, transferType: string, walkSeconds?: number) => ({
  stationId: `survival:${operator}:${code}`,
  operatorCode: operator,
  stationCode: code,
  stationName: code,
  transferType,
  ...(walkSeconds && { walkSeconds }),
});
const catalog: RailCatalog = {
  schemaVersion: 1,
  generatedAt: "",
  state: "healthy",
  sources: [],
  operators: [
    { id: "survival:SURC", serverId: "survival", code: "SURC", name: "生存中部铁路" },
    { id: "survival:PUAT", serverId: "survival", code: "PUAT", name: "蒲塘桥都会区交通" },
  ],
  lines: [],
  stations,
  stationGroups: [
    {
      id: "g1",
      serverId: "survival",
      code: "JBS-Group",
      name: "海侧约翰枢纽",
      members: [member("SURC", "JBS", "IN_STATION"), member("PUAT", "JBS", "IN_STATION")],
    },
    {
      id: "g2",
      serverId: "survival",
      code: "PPK-Group",
      name: "蒲塘桥港枢纽",
      members: [member("PUAT", "PPK", "IN_STATION", 45), member("SURC", "PPK", "IN_STATION")],
    },
    {
      id: "g3",
      serverId: "survival",
      code: "RVS-PHI",
      name: "河滨道-浦汇虚拟换乘",
      members: [member("SURC", "RVS", "OUT_OF_STATION"), member("SURC", "PHI", "OUT_OF_STATION")],
    },
  ],
};
const ref = (operatorCode: string, stationCode: string) => ({
  serverId: "survival",
  operatorCode,
  stationCode,
});

describe("hubOf", () => {
  it("IN_STATION 的成员合成一个枢纽；站名相同时用站名，组名作副标题", () => {
    const hub = hubOf(catalog, stations[1]!);
    expect(hub.members.map((m) => m.id)).toEqual(["survival:SURC:JBS", "survival:PUAT:JBS"]);
    expect(hub.name).toBe("海侧约翰");
    expect(hub.groupName).toBe("海侧约翰枢纽");
    expect(hubOperators(catalog, hub)).toEqual(["SURC", "PUAT"]);
  });

  it("成员站名不同时用组名；API 给了换乘时间时带上（车站信息与规划用同一个数）", () => {
    const hub = hubOf(catalog, stations[2]!);
    expect(hub.name).toBe("蒲塘桥港枢纽");
    expect(hub.walkSeconds).toBe(45);
    expect(hubOf(catalog, stations[0]!).walkSeconds).toBeUndefined();
  });

  it("OUT_OF_STATION 的组不合并；不在组里的站就是它自己", () => {
    expect(hubOf(catalog, stations[4]!)).toEqual({ members: [stations[4]], name: "河滨道" });
    expect(hubOf(catalog, stations[6]!).members).toEqual([stations[6]]);
  });

  it("旧版 API 没有车站组时，每个站都是它自己", () => {
    const old = { ...catalog, stationGroups: undefined };
    expect(hubOf(old, stations[0]!).members).toEqual([stations[0]]);
  });
});

describe("hubKeys / sameHub", () => {
  it("枢纽全部成员站的 key；catalog 里没有的站只有它自己", () => {
    expect(hubKeys(catalog, ref("PUAT", "JBS"))).toEqual(["SURC:JBS", "PUAT:JBS"]);
    expect(hubKeys(catalog, ref("SURC", "XYZ"))).toEqual(["SURC:XYZ"]);
  });

  it("同一个枢纽的两个成员站算同一个站，站外换乘的两站不算", () => {
    expect(sameHub(catalog, ref("SURC", "JBS"), ref("PUAT", "JBS"))).toBe(true);
    expect(sameHub(catalog, ref("SURC", "RVS"), ref("SURC", "PHI"))).toBe(false);
    expect(sameHub(catalog, ref("SURC", "JBS"), ref("SURC", "PPK"))).toBe(false);
  });
});

describe("hubTransfers", () => {
  it("每个枢纽一组成员站 key，API 给了 walkSeconds 时带上；出站换乘的组不在里面", () => {
    expect(hubTransfers(catalog, "survival")).toEqual([
      { stations: ["SURC:JBS", "PUAT:JBS"] },
      { stations: ["PUAT:PPK", "SURC:PPK"], seconds: 45 },
    ]);
  });
});

describe("hubLines", () => {
  it("各成员站停靠的线路，按成员顺序，同一条线只列一次；经车站组换乘的线路不算", () => {
    const line = (operatorCode: string, lineCode: string, via?: string) => ({
      lineId: `survival:${operatorCode}:${lineCode}`,
      operatorCode,
      lineCode,
      lineName: lineCode,
      ...(via && { viaStationCode: via }),
    });
    const surc = {
      ...stations[0]!,
      lines: [line("SURC", "DS"), line("SURC", "MT"), line("PUAT", "SM", "JBS")],
    };
    const puat = { ...stations[1]!, lines: [line("PUAT", "SM"), line("SURC", "MT", "JBS")] };
    expect(hubLines([surc, puat, surc]).map((l) => l.lineCode)).toEqual(["DS", "MT", "SM"]);
  });
});
