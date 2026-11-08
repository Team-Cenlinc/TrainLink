import { describe, expect, it } from "vitest";
import { foldOf, layoutOf } from "./useLayout.ts";

/** 假的媒体查询：视口大小与折痕把屏幕分成的段数。 */
function screen({
  width,
  height = 700,
  columns = 1,
  rows = 1,
}: {
  width: number;
  height?: number;
  columns?: number;
  rows?: number;
}) {
  return (query: string) => {
    if (query === "(horizontal-viewport-segments: 2)") return columns === 2;
    if (query === "(vertical-viewport-segments: 2)") return rows === 2;
    if (query === "(orientation: landscape)") return width > height;
    const minWidth = Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0);
    const minHeight = Number(/min-height: (\d+)px/.exec(query)?.[1] ?? 0);
    return width >= minWidth && height >= minHeight;
  };
}

describe("折叠姿势", () => {
  it("屏幕左右分成两段是书本式，上下分成两段是笔记本式", () => {
    expect(foldOf(screen({ width: 669, columns: 2 }))).toBe("book");
    expect(foldOf(screen({ width: 951, rows: 2 }))).toBe("tabletop");
  });

  it("没有折痕（放平、合上，或浏览器不支持）时不算折叠", () => {
    expect(foldOf(screen({ width: 951 }))).toBeNull();
  });
});

describe("布局", () => {
  it("没有折痕时按宽度选择", () => {
    expect(layoutOf(screen({ width: 382 }))).toBe("compact");
    expect(layoutOf(screen({ width: 951 }))).toBe("medium");
    expect(layoutOf(screen({ width: 1440 }))).toBe("wide");
  });

  it("半折时不论多宽都用两块内容的布局：手机布局的面板和桌面的侧边栏都会压在折痕上", () => {
    expect(layoutOf(screen({ width: 669, columns: 2 }))).toBe("medium");
    expect(layoutOf(screen({ width: 669, rows: 2 }))).toBe("medium");
    expect(layoutOf(screen({ width: 1440, columns: 2 }))).toBe("medium");
  });
});

describe("手动打开半折布局（浏览器报告不了折痕时）", () => {
  it("内屏横着是书本式，竖着是笔记本式：折痕总在长边的中间", () => {
    expect(foldOf(screen({ width: 951, height: 620 }), true)).toBe("book");
    expect(foldOf(screen({ width: 669, height: 867 }), true)).toBe("tabletop");
  });

  it("Safari 工具栏展开时视口变矮，也还算内屏", () => {
    expect(foldOf(screen({ width: 951, height: 501 }), true)).toBe("book");
  });

  it("外屏和内屏的分屏窗口没有折痕，开着也不分", () => {
    expect(foldOf(screen({ width: 382, height: 618 }), true)).toBeNull();
    expect(foldOf(screen({ width: 594, height: 368 }), true)).toBeNull();
    expect(foldOf(screen({ width: 385, height: 571 }), true)).toBeNull();
  });

  it("没打开时只看浏览器报告的折痕", () => {
    expect(foldOf(screen({ width: 951, height: 620 }))).toBeNull();
    expect(layoutOf(screen({ width: 669, height: 867 }))).toBe("compact");
  });

  it("浏览器报告了折痕时以它为准", () => {
    expect(foldOf(screen({ width: 951, height: 620, rows: 2 }), true)).toBe("tabletop");
  });

  it("打开后不论多宽都用两块内容的布局", () => {
    expect(layoutOf(screen({ width: 669, height: 867 }), true)).toBe("medium");
  });
});
