import { useRef, useState } from "react";
import { useMotionValueEvent, type MotionValue } from "motion/react";

/**
 * 跟手淡入淡出的元素此刻是否看得见：progress 每帧都在变，这里只在越过阈值时更新一次状态。
 * 看不见的按钮与链接据此设为 inert，不再能用 Tab 键聚焦，读屏软件也不会读到。
 *
 * progress 常是派生值，父组件渲染时会同步发出 change 事件；状态更新放到微任务里，
 * 等那次渲染结束再做，不在渲染别的组件时改这里的状态。
 */
export function useShown(progress: MotionValue<number>, isShown: (p: number) => boolean) {
  const [shown, setShown] = useState(() => isShown(progress.get()));
  const latest = useRef(shown);
  useMotionValueEvent(progress, "change", (p) => {
    const next = isShown(p);
    if (next === latest.current) return;
    latest.current = next;
    queueMicrotask(() => setShown(next));
  });
  return shown;
}
