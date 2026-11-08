import { useSyncExternalStore } from "react";
import { readSettings, subscribeSettings } from "./settings.ts";

/**
 * 按可用宽度（而不是设备名）切换布局：
 * - compact：< 768，单栏 + 浮动标签栏 + 可拖动面板（手机、竖放的小平板、折叠屏合上）
 * - medium：768–1279，本站发车 + 列车位置两块，保留浮动标签栏（平板、折叠屏展开）
 * - wide：≥ 1280，侧边栏 + 同样两块（桌面）
 * 发车区内部是否按方向分两栏，由它自己的宽度决定（见 WideBoard 的容器查询）。
 * 断点按「列车位置固定 360 宽、发车区至少约 300 宽」推算，任何宽度都不挤。
 * 半折时不看宽度，一律 medium：两块内容分放在折痕两边（<html data-fold> 与各段的尺寸 --fold-*，见 global.css）。
 */
export type Layout = "compact" | "medium" | "wide";

/**
 * 半折的姿势：book 是屏幕左右分成两段，tabletop 是上下两段；放平、合上或浏览器不支持时为 null。
 * 优先听浏览器报告的折痕（Viewport Segments API）。Safari 27.1 上它还要在功能标记里打开，
 * 有的系统版本列表里找不到，所以设置里另有手动开关（manualFold）：内屏横着算书本式，竖着算笔记本式，
 * 折痕按屏幕中线算，不会随开合自动切换。外屏和分屏窗口没有折痕，太小的视口不分。
 */
export type Fold = "book" | "tabletop" | null;

const mediumQuery = "(min-width: 768px)";
const wideQuery = "(min-width: 1280px)";
const bookQuery = "(horizontal-viewport-segments: 2)";
const tabletopQuery = "(vertical-viewport-segments: 2)";
/** 够大才算内屏：外屏（382×618、594×368）与内屏分屏窗口（385 宽）都比它小；高度留出 Safari 工具栏展开的余量。 */
const innerScreenQuery = "(min-width: 640px) and (min-height: 480px)";
const landscapeQuery = "(orientation: landscape)";
/** 设置里显示手动开关：触屏的内屏（用鼠标的电脑和普通手机都不需要）。 */
const manualFoldOfferQuery = `(pointer: coarse) and ${innerScreenQuery}`;

type Matches = (query: string) => boolean;

export function foldOf(matches: Matches, manual = false): Fold {
  if (matches(bookQuery)) return "book";
  if (matches(tabletopQuery)) return "tabletop";
  if (!manual || !matches(innerScreenQuery)) return null;
  return matches(landscapeQuery) ? "book" : "tabletop";
}

export function layoutOf(matches: Matches, manual = false): Layout {
  if (foldOf(matches, manual)) return "medium";
  if (matches(wideQuery)) return "wide";
  if (matches(mediumQuery)) return "medium";
  return "compact";
}

const browserMatches: Matches = (query) => window.matchMedia(query).matches;

function subscribe(onChange: () => void) {
  const lists = [
    mediumQuery,
    wideQuery,
    bookQuery,
    tabletopQuery,
    innerScreenQuery,
    landscapeQuery,
    manualFoldOfferQuery,
  ].map((q) => window.matchMedia(q));
  for (const list of lists) list.addEventListener("change", onChange);
  const stopSettings = subscribeSettings(onChange);
  return () => {
    for (const list of lists) list.removeEventListener("change", onChange);
    stopSettings();
  };
}

const currentFold = () => foldOf(browserMatches, readSettings().manualFold);

/**
 * 当前布局。useSyncExternalStore 是 React 订阅外部状态（这里是媒体查询）的标准做法：
 * 窗口跨过断点时组件重新渲染，其余时候不渲染。
 */
export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, () => layoutOf(browserMatches, readSettings().manualFold));
}

/** 当前的半折姿势，翻折或改设置时组件重新渲染。 */
export function useFold(): Fold {
  return useSyncExternalStore(subscribe, currentFold);
}

/** 这块屏幕要不要在设置里给手动开关。 */
export function useManualFoldOffered(): boolean {
  return useSyncExternalStore(subscribe, () => browserMatches(manualFoldOfferQuery));
}

/** 把当前姿势写到 <html data-fold>，各处样式据此排版（见 global.css）；在第一次渲染前调用。 */
export function watchFold() {
  const apply = () => {
    const fold = currentFold();
    if (fold) document.documentElement.dataset.fold = fold;
    else delete document.documentElement.dataset.fold;
  };
  apply();
  subscribe(apply);
}

/**
 * 弹出内容的样式：手机用底部面板，大屏用弹出卡片。
 * 半折时也用底部面板：它整块放在折痕的一边（见 Overlay.module.css），弹出卡片会跟着按钮压到折痕上。
 */
export function useOverlayVariant(): "sheet" | "popover" {
  const layout = useLayout();
  const fold = useFold();
  return layout === "compact" || fold ? "sheet" : "popover";
}
