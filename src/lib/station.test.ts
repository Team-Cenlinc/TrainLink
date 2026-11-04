import { describe, expect, it } from "vitest";
import type { LineShape } from "./lineShape.ts";
import type { RailCatalog, RailStation, RailStationLine } from "./railApi.ts";
import { nearestTransfer, neighbourStops } from "./station.ts";

const line = (lineCode: string): RailStationLine => ({
  lineId: `survival:SURC:${lineCode}`,
  operatorCode: "SURC",
  lineCode,
  lineName: lineCode,
  color: "#D920D9",
});
const mt = line("MT");
const ds = line("DS");

/** 大都会线：PPK-PTK-SPB-JBS-OFL 是主干，在 SPB 分出 WSD-HHU。 */
const shape: LineShape = {
  main: ["PPK", "PTK", "SPB", "JBS", "OFL"],
  branches: [{ junction: "SPB", stops: ["WSD", "HHU"] }],
};

function catalogWith(transfersAt: string[]): RailCatalog {
  const codes = [...shape.main, ...shape.branches.flatMap((b) => b.stops)];
  return {
    schemaVersion: 1,
    generatedAt: "",
    state: "healthy",
    sources: [],
    operators: [{ id: "survival:SURC", serverId: "survival", code: "SURC", name: "SURC" }],
    lines: [],
    stations: codes.map((code) => ({
      id: `survival:SURC:${code}`,
      serverId: "survival",
      operatorId: "survival:SURC",
      code,
      name: code,
      lines: transfersAt.includes(code) ? [mt, ds] : [mt],
    })),
  };
}

const stationIn = (catalog: RailCatalog, code: string): RailStation =>
  catalog.stations.find((s) => s.code === code)!;

describe("前后站条", () => {
  it("分岔站标出另一支的下一站；其余站没有", () => {
    const catalog = catalogWith([]);
    const stops = neighbourStops(catalog, shape, stationIn(catalog, "PTK"), mt);

    expect(stops.map((s) => s.code)).toEqual(["PPK", "PTK", "SPB", "JBS"]);
    expect(stops.find((s) => s.code === "SPB")?.forks).toEqual(["WSD"]);
    expect(stops.find((s) => s.code === "PTK")?.forks).toEqual([]);
  });

  it("不在这条线上的车站：没有站条", () => {
    const catalog = catalogWith([]);
    const other = { ...stationIn(catalog, "PTK"), code: "XXX" };
    expect(neighbourStops(catalog, shape, other, mt)).toEqual([]);
  });
});

describe("沿线最近的换乘站", () => {
  it("最近的换乘站在另一支上：经分岔站找得到，距离按实际站数算", () => {
    const catalog = catalogWith(["WSD", "OFL"]);
    const nearest = nearestTransfer(catalog, shape, stationIn(catalog, "PTK"), mt);
    expect(nearest?.stop.code).toBe("WSD");
    expect(nearest?.distance).toBe(2);
  });

  it("从支线往回找：过分岔站再到主干", () => {
    const catalog = catalogWith(["PTK"]);
    const nearest = nearestTransfer(catalog, shape, stationIn(catalog, "HHU"), mt);
    expect(nearest?.stop.code).toBe("PTK");
    expect(nearest?.distance).toBe(3);
  });

  it("距离相同时先取站序在前的一侧", () => {
    const catalog = catalogWith(["PPK", "SPB"]);
    const nearest = nearestTransfer(catalog, shape, stationIn(catalog, "PTK"), mt);
    expect(nearest?.stop.code).toBe("PPK");
    expect(nearest?.distance).toBe(1);
  });

  it("全线都没有换乘站时没有结果", () => {
    const catalog = catalogWith([]);
    expect(nearestTransfer(catalog, shape, stationIn(catalog, "PTK"), mt)).toBeUndefined();
  });
});
