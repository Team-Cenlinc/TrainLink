import type { LineTrain } from "./linePositions.ts";

/**
 * 线路图上同一侧列车卡片的纵向摆放。纯函数，不涉及 React；尺寸与 LineView.module.css 一致。
 */

/** 每站一行的高度；列车位置按行换算成纵坐标。 */
export const rowHeight = 72;
/** 一列车在卡片里占的高度（标题 36 + 正文 28）；合并卡片按车数叠加。用于避让同一侧的相邻卡片。 */
export const cardHeight = 64;
export const cardGap = 6;
/** 浮在卡片上方的晚点标签占的高度（行高 17 + 与卡片的间隔 3，见 .delay）。 */
export const delayLabelHeight = 20;

export interface PlacedCard {
  trains: LineTrain[];
  /** 列车在线路图上的真实纵坐标，位置三角指向这里。 */
  anchor: number;
  /** 卡片顶边的纵坐标。 */
  top: number;
}

/**
 * 同一侧卡片的摆放：
 * 1. 同一侧、同一位置（同停一站或同在一个区间）的几列车合成一张卡片，每列车一段，都留在那一站旁边；
 * 2. 仍然重叠的卡片合成一组，整组以各卡片真实位置的平均值为中心排开，
 *    并限制在线路图范围内（不会挤到最后一站下面）。位置三角仍指向每张卡片的真实位置。
 * 浮在卡片上方的晚点标签也算卡片占用的空间，不会盖住上面那张卡片。
 */
export function placeColumn(trains: LineTrain[], height: number): PlacedCard[] {
  // lead：卡片上方为晚点标签留的空间（只有第一列车的标签浮在卡片上方，后面几列放在车厢行里）。
  type Item = { trains: LineTrain[]; anchor: number; lead: number };
  // 组的 top 是第一项占用空间的顶边（有晚点标签时是标签的顶边）。
  type Group = { items: Item[]; top: number };
  const cardsHeight = (item: Item) => item.trains.length * cardHeight;
  const itemHeight = (item: Item) => item.lead + cardsHeight(item);
  const size = (g: Group) =>
    g.items.reduce((sum, item) => sum + itemHeight(item), 0) + (g.items.length - 1) * cardGap;
  const clamp = (g: Group) => {
    g.top = Math.min(Math.max(g.top, 0), height - size(g));
  };

  const items: Item[] = [];
  for (const train of [...trains].sort((a, b) => a.slot - b.slot)) {
    const previous = items.at(-1);
    if (previous && previous.trains[0]!.slot === train.slot) previous.trains.push(train);
    else {
      items.push({
        trains: [train],
        anchor: train.slot * rowHeight + rowHeight / 2,
        lead: train.delayMinutes ? delayLabelHeight : 0,
      });
    }
  }

  const groups: Group[] = [];
  for (const item of items) {
    const group: Group = {
      items: [item],
      top: item.anchor - cardsHeight(item) / 2 - item.lead,
    };
    clamp(group);
    groups.push(group);
    // 与上一组重叠就合并，并重新居中；合并后可能又碰到更上一组，所以循环。
    while (groups.length > 1) {
      const b = groups[groups.length - 1]!;
      const a = groups[groups.length - 2]!;
      if (a.top + size(a) + cardGap <= b.top) break;
      a.items.push(...b.items);
      const mean = a.items.reduce((sum, i) => sum + i.anchor, 0) / a.items.length;
      a.top = mean - size(a) / 2;
      clamp(a);
      groups.pop();
    }
  }

  return groups.flatMap((g) => {
    let top = g.top;
    return g.items.map((item) => {
      const placed = { trains: item.trains, anchor: item.anchor, top: top + item.lead };
      top += itemHeight(item) + cardGap;
      return placed;
    });
  });
}
