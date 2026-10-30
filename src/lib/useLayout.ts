import { useSyncExternalStore } from "react";

/**
 * 按可用宽度（而不是设备名）切换布局：
 * - compact：< 768，单栏 + 浮动标签栏 + 可拖动面板（手机、竖放的小平板、折叠屏合上）
 * - medium：768–1279，本站发车 + 列车位置两块，保留浮动标签栏（平板、折叠屏展开）
 * - wide：≥ 1280，侧边栏 + 同样两块（桌面）
 * 发车区内部是否按方向分两栏，由它自己的宽度决定（见 WideBoard 的容器查询）。
 * 断点按「列车位置固定 360 宽、发车区至少约 300 宽」推算，任何宽度都不挤。
 */
export type Layout = "compact" | "medium" | "wide";

const mediumQuery = "(min-width: 768px)";
const wideQuery = "(min-width: 1280px)";

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
