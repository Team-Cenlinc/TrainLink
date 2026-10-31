import { describe, expect, it } from "vitest";
import { measureDetents } from "./detents.ts";

describe("measureDetents", () => {
  it("竖屏：默认档在标题下方，下拉档露出车站周围信息", () => {
    expect(
      measureDetents({ barHeight: 64, titleBottom: 220, contextBottom: 420, viewportHeight: 844 }),
    ).toEqual({ expanded: 64, normal: 244, peek: 420 });
  });

  it("下拉档至少比默认档低 120", () => {
    expect(
      measureDetents({ barHeight: 64, titleBottom: 220, contextBottom: 260, viewportHeight: 844 })
        .peek,
    ).toBe(364);
  });

  it("矮屏或横屏：给面板留的可见高度不够时，下拉档也不会高过默认档", () => {
    const detents = measureDetents({
      barHeight: 64,
      titleBottom: 220,
      contextBottom: 420,
      viewportHeight: 375,
    });
    expect(detents.expanded).toBeLessThanOrEqual(detents.normal);
    expect(detents.normal).toBeLessThanOrEqual(detents.peek);
  });

  it("标题栏比默认档还高时，推上档不会低过默认档", () => {
    const detents = measureDetents({
      barHeight: 120,
      titleBottom: 60,
      contextBottom: 60,
      viewportHeight: 300,
    });
    expect(detents.expanded).toBeLessThanOrEqual(detents.normal);
    expect(detents.normal).toBeLessThanOrEqual(detents.peek);
  });
});
