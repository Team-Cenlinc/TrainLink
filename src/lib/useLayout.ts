import { useSyncExternalStore } from "react";

/**
 * 按可用宽度（而不是设备名）切换布局，断点取自设计稿 v05：
 * - compact：< 600，单栏 + 浮动标签栏 + 可拖动面板（手机）
 * - medium：600–1099，两栏：本站发车 / 列车位置（平板、折叠屏）
 * - wide：≥ 1100，侧边栏 + 三栏（桌面）
 */
export type Layout = "compact" | "medium" | "wide";

const mediumQuery = "(min-width: 600px)";
const wideQuery = "(min-width: 1100px)";

function currentLayout(): Layout {
  if (window.matchMedia(wideQuery).matches) return "wide";
  if (window.matchMedia(mediumQuery).matches) return "medium";
  return "compact";
}

function subscribe(onChange: () => void) {
  const lists = [window.matchMedia(mediumQuery), window.matchMedia(wideQuery)];
  for (const list of lists) list.addEventListener("change", onChange);
  return () => {
    for (const list of lists) list.removeEventListener("change", onChange);
  };
}

/**
 * 当前布局。useSyncExternalStore 是 React 订阅外部状态（这里是媒体查询）的标准做法：
 * 窗口跨过断点时组件重新渲染，其余时候不渲染。
 */
export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, currentLayout);
}
