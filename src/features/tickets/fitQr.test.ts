import { describe, expect, it } from "vitest";
import { fitQrSize } from "./fitQr.ts";

describe("二维码随可用高度伸缩", () => {
  it("票超出可见区域时缩小二维码，正好补上超出的高度", () => {
    expect(fitQrSize({ current: 200, spare: -40, max: 200 })).toBe(160);
  });

  it("有富余时放大，但不超过上限", () => {
    expect(fitQrSize({ current: 150, spare: 30, max: 200 })).toBe(180);
    expect(fitQrSize({ current: 150, spare: 300, max: 200 })).toBe(200);
  });

  it("太矮的屏幕也不小于 120（再小扫不出来），宁可让页面滚动", () => {
    expect(fitQrSize({ current: 160, spare: -200, max: 200 })).toBe(120);
  });

  it("上限比下限还小时（很窄的屏幕）用上限", () => {
    expect(fitQrSize({ current: 100, spare: 50, max: 110 })).toBe(110);
  });

  it("往下取整到像素：宁可小一点，也不超出半个像素让页面能多滚 1 px", () => {
    expect(fitQrSize({ current: 180.4, spare: -0.6, max: 200 })).toBe(179);
    expect(fitQrSize({ current: 180, spare: 0.9, max: 200 })).toBe(180);
  });
});
