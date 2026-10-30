/** 线路色缺失时使用的中性深色，与 --action 一致。 */
export const fallbackLineColor = "#1B2022";

/**
 * 按 FTCA PIDS 规则为线路色选择文字色：相对亮度高于 0.25 用深色字，否则用浅色字。
 * 例如大都会线 #D920D9 得到浅色字，浦蓝线 #70DEEE 得到深色字。
 */
export function onLineColor(hex: string): string {
  return relativeLuminance(hex) > 0.25 ? "var(--on-line-dark)" : "var(--on-line-light)";
}

/** WCAG 相对亮度，取值 0（黑）到 1（白）。 */
function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((start) => parseInt(value.slice(start, start + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
