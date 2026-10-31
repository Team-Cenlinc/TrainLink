import { describe, expect, it } from "vitest";
import type { LineTrain } from "./linePositions.ts";
import { cardGap, cardHeight, delayLabelHeight, placeColumn, rowHeight } from "./placeColumn.ts";

function train(name: string, slot: number, delayMinutes?: number): LineTrain {
  return { name, slot, direction: "toEnd", serviceType: "普通", delayMinutes };
}

/** 8 站的线路图高度。 */
const height = 8 * rowHeight;
const names = (placed: ReturnType<typeof placeColumn>) =>
  placed.map((p) => p.trains.map((t) => t.name));

describe("placeColumn", () => {
  it("卡片以列车位置为中心，位置三角指向真实位置", () => {
    const [card] = placeColumn([train("a", 2.5)], height);
    expect(card?.anchor).toBe(2.5 * rowHeight + rowHeight / 2);
    expect(card?.top).toBe(card!.anchor - cardHeight / 2);
  });

  it("同一位置的几列车合成一张卡片", () => {
    const placed = placeColumn([train("a", 3), train("b", 1), train("c", 3)], height);
    expect(names(placed)).toEqual([["b"], ["a", "c"]]);
  });

  it("相互重叠的卡片排开、留出间距，整组以真实位置的平均值为中心", () => {
    const placed = placeColumn([train("a", 2), train("b", 2.5)], height);
    const [a, b] = placed;
    expect(b!.top - a!.top).toBe(cardHeight + cardGap);
    const mean = (a!.anchor + b!.anchor) / 2;
    expect((a!.top + b!.top + cardHeight) / 2).toBe(mean);
  });

  it("不会超出线路图的上下边界", () => {
    // 首末站各停着三列车，合并卡片比一行高得多。
    const three = (slot: number) => ["a", "b", "c"].map((n) => train(`${n}${slot}`, slot));
    const placed = placeColumn([...three(0), ...three(7)], height);
    expect(placed[0]?.top).toBe(0);
    expect(placed[1]?.top).toBe(height - 3 * cardHeight);
  });

  it("晚点标签浮在卡片上方：为它留出位置，不会盖住上面那张卡片", () => {
    const [above, delayed] = placeColumn([train("a", 2), train("b", 3, 4)], height);
    expect(delayed!.top - delayLabelHeight).toBeGreaterThanOrEqual(
      above!.top + cardHeight + cardGap,
    );
  });

  it("最上面一张卡片的晚点标签也不会超出线路图", () => {
    const [card] = placeColumn([train("a", 0, 6)], height);
    expect(card!.top - delayLabelHeight).toBeGreaterThanOrEqual(0);
  });
});
