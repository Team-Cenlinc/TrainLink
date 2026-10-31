/**
 * 看板面板的三档位置（面板顶边距屏幕顶部的像素）。
 * expanded：推上，盖到收起的标题栏下方；normal：默认；peek：下拉，露出车站周围信息。
 */
export interface Detents {
  expanded: number;
  normal: number;
  peek: number;
}

/**
 * 由量出的布局位置算出三档。纯函数，不涉及 React。
 * 始终保证 expanded ≤ normal ≤ peek：矮屏或横屏时给面板留的可见高度不够，下拉档就与默认档重合，
 * 而不是跑到默认档上面（顺序颠倒后拖动与键盘切换都会乱）。
 */
export function measureDetents(input: {
  /** 收起标题栏的高度。 */
  barHeight: number;
  /** 大站名区块底边的位置。 */
  titleBottom: number;
  /** 下拉后露出的「车站周围」区块底边的位置。 */
  contextBottom: number;
  viewportHeight: number;
}): Detents {
  const normal = Math.round(input.titleBottom + 24);
  const expanded = Math.min(input.barHeight, normal);
  // 下拉档至少比默认低 120，并给面板留出约 240 的可见高度；两者冲突时不高过默认档。
  const wanted = Math.max(input.contextBottom, normal + 120);
  const peek = Math.round(Math.max(normal, Math.min(wanted, input.viewportHeight - 240)));
  return { expanded, normal, peek };
}
