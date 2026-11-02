import { describe, expect, it } from "vitest";
import { allStations, linePatterns, lineShape } from "./lineShape.ts";

// 大都会线：PPK-RVS-PTK-SPB 是主干，在 SPB 分成两支：往 OFL（JBS-HXB-HAS-OFL）、往 HHU（WSD-SCC-ZKW-HHU）。
const toOfl = ["PPK", "RVS", "PTK", "SPB", "JBS", "HXB", "HAS", "OFL"];
const toHhu = ["PPK", "RVS", "PTK", "SPB", "WSD", "SCC", "ZKW", "HHU"];
const express = ["PPK", "PTK", "SPB", "WSD", "ZKW", "HHU"];

describe("线路的停站方式", () => {
  it("各班车的站序去重：往返算同一种，快车、区间车（站是别的方式的子集）不另算；车多的在前", () => {
    const patterns = linePatterns([
      toOfl,
      [...toOfl].reverse(),
      toHhu,
      [...toHhu].reverse(),
      [...toHhu].reverse(),
      express,
      ["PPK", "RVS", "PTK"],
    ]);
    expect(patterns).toEqual([toHhu, toOfl]);
  });

  it("各种停站方式朝同一个方向：共有的站先后一致", () => {
    const [first, second] = linePatterns([toHhu, toHhu, [...toOfl].reverse()]);
    expect(first).toEqual(toHhu);
    expect(second).toEqual(toOfl);
  });
});

describe("线路形状", () => {
  const patterns = [toHhu, toOfl];

  it("本站在主干上：画车多的那一支，另一支从分岔站接出，由近及远", () => {
    expect(lineShape(patterns, "PTK")).toEqual({
      main: toHhu,
      branches: [{ junction: "SPB", stops: ["JBS", "HXB", "HAS", "OFL"] }],
    });
  });

  it("本站在支线上：画本站所在的那一支", () => {
    expect(lineShape(patterns, "HXB")).toEqual({
      main: toOfl,
      branches: [{ junction: "SPB", stops: ["WSD", "SCC", "ZKW", "HHU"] }],
    });
  });

  it("支线在主干起点那头分出时，整条线倒过来：分岔站之前的共用段在上，各支都往下分开", () => {
    // GTFS 里两支都写成从支线终点开往蒲塘桥港（OFL…PPK、HHU…PPK）。
    expect(lineShape([[...toOfl].reverse(), [...toHhu].reverse()], "PTK")).toEqual({
      main: toOfl,
      branches: [{ junction: "SPB", stops: ["WSD", "SCC", "ZKW", "HHU"] }],
    });
  });

  it("两头都有支线时不倒过来，起点那头的支线也由分岔站往外排", () => {
    const shape = lineShape([toHhu, ["Y", "X", "PPK", "RVS"], toOfl], "PTK");
    expect(shape.main).toEqual(toHhu);
    expect(shape.branches).toEqual([
      { junction: "PPK", stops: ["X", "Y"] },
      { junction: "SPB", stops: ["JBS", "HXB", "HAS", "OFL"] },
    ]);
  });

  it("绕行一段又并回主干：记下并回的站，支线画到那里为止", () => {
    // PTK 与 SPB 之间另有一条经 X、Y 的线。
    const shape = lineShape([toHhu, ["PPK", "PTK", "X", "Y", "SPB", "WSD"]], "PTK");
    expect(shape.branches).toEqual([{ junction: "PTK", stops: ["X", "Y"], rejoin: "SPB" }]);
  });

  it("没有支线的线路：只有主干", () => {
    expect(lineShape([toOfl], "PTK")).toEqual({ main: toOfl, branches: [] });
  });

  it("全线车站：主干在前，各支线接在后面", () => {
    expect(allStations(lineShape(patterns, "PTK"))).toEqual([...toHhu, "JBS", "HXB", "HAS", "OFL"]);
  });
});
