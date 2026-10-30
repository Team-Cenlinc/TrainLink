import {
  animate,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  type PanInfo,
} from "motion/react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * 看板面板的三档位置（面板顶边距屏幕顶部的像素）。
 * expanded：推上，盖到收起的标题栏下方；normal：默认；peek：下拉，露出车站周围信息。
 */
export interface Detents {
  expanded: number;
  normal: number;
  peek: number;
}

export type Detent = keyof Detents;

/** 从上到下的顺序，用于键盘上下切换。 */
export const detentOrder: Detent[] = ["expanded", "normal", "peek"];

/**
 * 按松手速度预判停点（Apple《Designing Fluid Interfaces》的投影公式）。
 * 减速率 0.99 比滚动更「黏」，适合有固定停点的面板。
 */
function project(velocity: number, decelerationRate = 0.99): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * 面板的位置状态：y 是面板顶边位置的 motion value，拖动时 1:1 跟手；
 * 松手后按速度投影到最近的一档，再用弹簧过去，并把手指速度交给弹簧，拖动与动画之间没有断点。
 */
export function useSheetDetents(detents: Detents | null) {
  const y = useMotionValue(0);
  const [detent, setDetent] = useState<Detent>("normal");
  const dragControls = useDragControls();
  const reduceMotion = useReducedMotion();
  const placed = useRef(false);

  // 第一次量出各档位置时，直接放到默认档；之后尺寸变化（例如旋转屏幕）时跟着当前档走。
  useLayoutEffect(() => {
    if (!detents) return;
    y.set(detents[placed.current ? detent : "normal"]);
    placed.current = true;
    // 只在尺寸变化时重新定位；切换档位由 goTo 负责动画。
  }, [detents]);

  const goTo = useCallback(
    (next: Detent, velocity = 0) => {
      setDetent(next);
      if (!detents) return;
      if (reduceMotion) {
        y.set(detents[next]);
        return;
      }
      // 临界阻尼弹簧，不回弹：面板一旦过冲，就会在顶部露出色块、在底部露出标签栏。
      // 仍把松手速度交给弹簧，甩得快就落得快，拖动与动画之间没有停顿。
      void animate(y, detents[next], {
        type: "spring",
        bounce: 0,
        duration: 0.38,
        velocity,
      });
    },
    [detents, reduceMotion, y],
  );

  const onDragEnd = useCallback(
    (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
      if (!detents) return;
      const projected = y.get() + project(info.velocity.y);
      const nearest = detentOrder.reduce((best, d) =>
        Math.abs(detents[d] - projected) < Math.abs(detents[best] - projected) ? d : best,
      );
      goTo(nearest, info.velocity.y);
    },
    [detents, goTo, y],
  );

  /** 键盘：上箭头推上一档，下箭头下拉一档。 */
  const step = useCallback(
    (direction: -1 | 1) => {
      const next = detentOrder[detentOrder.indexOf(detent) + direction];
      if (next) goTo(next);
    },
    [detent, goTo],
  );

  return { y, detent, goTo, step, onDragEnd, dragControls };
}
