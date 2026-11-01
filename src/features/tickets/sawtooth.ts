/** 目标齿距（px）：实际齿距按宽度取整齿数后平分，两端都停在齿尖上。 */
const toothWidth = 16;

/**
 * 撕线锯齿的 clip-path：一排向上的三角，齿尖在顶边、齿谷贴着 valley 高度。
 * 整排画成一个多边形，没有拼接缝（平铺的遮罩在小数像素的拼接处会透出一条条细线）。
 * @param width 齿所在的宽度（票根内框宽）
 * @param height 色条总高；比 valley 高时，齿谷下面整条铺满
 * @param valley 齿谷的高度，默认等于 height
 * @param inset 两侧多出的外框宽度：齿往里错开这么多，外框那一截整段铺满（票身那排盖住外框）
 */
export function sawtooth({
  width,
  height,
  valley = height,
  inset = 0,
}: {
  width: number;
  height: number;
  valley?: number;
  inset?: number;
}): string {
  const count = Math.max(1, Math.round(width / toothWidth));
  const step = width / count;
  const px = (n: number) => `${+n.toFixed(2)}px`;
  const points = [`0px ${px(height)}`, "0px 0px"];
  if (inset) points.push(`${px(inset)} 0px`);
  for (let i = 0; i < count; i++) {
    points.push(`${px(inset + (i + 0.5) * step)} ${px(valley)}`);
    points.push(`${px(inset + (i + 1) * step)} 0px`);
  }
  if (inset) points.push(`${px(width + 2 * inset)} 0px`);
  points.push(`${px(width + 2 * inset)} ${px(height)}`);
  return `polygon(${points.join(", ")})`;
}
