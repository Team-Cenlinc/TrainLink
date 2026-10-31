import { useEffect } from "react";

/**
 * 页面顶部的颜色，交给贴顶的色条（index.html 的 #top-edge，样式见 global.css）。
 *
 * iOS 26/27 给状态栏着色、决定要不要在状态栏下面盖一层模糊渐变时，在屏幕顶边中点往下 4 px 做一次
 * 点击检测，沿命中的元素往上找第一个 fixed / sticky 元素（WebKit 的 LocalFrameView::fixedContainerEdges）：
 * - 宽度不到视口 90%、或高不超过 10 px 的不算；
 * - 铺满整屏的固定元素（我们的页面外壳）被当作「整屏层」，沿用上一次取到的颜色，换页、换车站都不更新；
 * - 一条铺满宽度的普通固定条：直接用它的背景色，每次都重新取，状态栏就是这个纯色，不盖模糊。
 * 所以顶上放一条固定色条，颜色跟着每页顶部（看板是线路色，其他页是标题块的 var(--hero)）。
 * 变量原样写进去，由 CSS 按当前外观取值，外观切换时自己跟着变。
 *
 * 冷启动时颜色按页面（看板 / 其他页）从本地先设上（restoreTopColor），第一帧就是对的；
 * 颜色还说不准时传 undefined，不覆盖。
 * @param color CSS 颜色，可以是 var(--hero) 这样的变量；undefined 表示先不改。
 */
export function useTopColor(color: string | undefined) {
  useEffect(() => {
    if (!color) return;
    setTopColor(color);
    try {
      const saved = readSaved();
      saved[pageKind(location.pathname)] = color;
      localStorage.setItem(key, JSON.stringify(saved));
    } catch {
      // 存不下就下次启动再取一次。
    }
  }, [color]);
}

const key = "trainlink.topColors";

/** 看板的顶部是车站的线路色，其他页都是标题块的深色：分两类存。 */
const pageKind = (pathname: string) => (pathname === "/" ? "board" : "page");

function readSaved(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function setTopColor(color: string) {
  document.documentElement.style.setProperty("--top-color", color);
}

/** 启动时（第一次渲染前）先用上次的顶部颜色，iOS 第一次取色就是对的。 */
export function restoreTopColor() {
  const saved = readSaved()[pageKind(location.pathname)];
  if (typeof saved === "string") setTopColor(saved);
}
