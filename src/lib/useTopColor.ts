import { useEffect } from "react";

/**
 * 页面顶部的颜色：写到 <html> 的 --top-color，只给从 iOS 主屏打开时用（状态栏透明，见 index.html）。
 * iOS 26 在状态栏下面盖的「滚动边缘」渐变取文档背景色，主屏模式的文档背景就用它
 *（global.css 的 data-standalone），与标题色块连成一片；切页、换车站都实时跟着变。
 * 每页把自己顶部的颜色交上来：看板是线路色，其他页是标题块的 var(--hero)。
 * 变量原样写进去，由 CSS 按当前外观取值，外观切换时自己跟着变。
 *
 * Safari 网页里的浏览器栏不跟：它的颜色来自 theme-color 和贴边固定元素的底色，
 * 实测站内切页后有时重取、有时不重取，跟着标题色走就会对不上，所以统一用面板灰（见 settings.ts 的 applyTheme）。
 *
 * 冷启动时颜色按页面（看板 / 其他页）从本地先设上（restoreTopColor），第一帧就是对的；
 * 颜色还说不准时传 undefined，不覆盖。
 * @param color CSS 颜色，可以是 var(--hero) 这样的变量；undefined 表示先不改。
 */
export function useTopColor(color: string | undefined) {
  useEffect(() => {
    if (!color || !isStandalone()) return;
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

const isStandalone = () => document.documentElement.dataset.standalone !== undefined;

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

/**
 * 启动时（第一次渲染前）：标记是否从 iOS 主屏以网页 App 打开（data-standalone，样式据此换文档背景），
 * 并先用上次的顶部颜色，第一帧状态栏下的渐变就是对的颜色。
 * 只认 iOS 的 navigator.standalone：Android、桌面装的 PWA 有自己的标题栏，不需要这套处理。
 */
export function restoreTopColor() {
  if ((navigator as Navigator & { standalone?: boolean }).standalone !== true) return;
  document.documentElement.dataset.standalone = "";
  const saved = readSaved()[pageKind(location.pathname)];
  if (typeof saved === "string") setTopColor(saved);
}
