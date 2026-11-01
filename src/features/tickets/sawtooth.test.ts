import { describe, expect, it } from "vitest";
import { sawtooth } from "./sawtooth.ts";

describe("撕线锯齿", () => {
  it("齿数按宽度取整，齿距平分整条宽度，两端停在齿尖上", () => {
    // 宽 32：两个齿，齿距 16；齿尖在 0、16、32，齿谷在 8、24（贴着底边）。
    expect(sawtooth({ width: 32, height: 8 })).toBe(
      "polygon(0px 8px, 0px 0px, 8px 8px, 16px 0px, 24px 8px, 32px 0px, 32px 8px)",
    );
    // 宽 36：仍是两个齿，齿距平分成 18。
    expect(sawtooth({ width: 36, height: 8 })).toBe(
      "polygon(0px 8px, 0px 0px, 9px 8px, 18px 0px, 27px 8px, 36px 0px, 36px 8px)",
    );
  });

  it("票身那排比票根宽出两侧外框：齿往里错开外框宽度，外框那一截整段盖住", () => {
    // 齿谷在 8 px 高，底下再铺 1 px（整条盖满）；两侧各 3 px 外框整段在里面。
    expect(sawtooth({ width: 32, height: 9, valley: 8, inset: 3 })).toBe(
      "polygon(0px 9px, 0px 0px, 3px 0px, 11px 8px, 19px 0px, 27px 8px, 35px 0px, 38px 0px, 38px 9px)",
    );
  });

  it("很窄时至少一个齿", () => {
    expect(sawtooth({ width: 6, height: 8 })).toBe(
      "polygon(0px 8px, 0px 0px, 3px 8px, 6px 0px, 6px 8px)",
    );
  });
});
