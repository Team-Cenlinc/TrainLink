/** 二维码边长的下限：再小手机扫码器就不好认了，宁可让页面滚动。 */
export const minQrSize = 120;

/**
 * 车票页的二维码边长：让整张票（连同下面的闸机按钮）正好放进面板顶边到浮动标签栏之间。
 * 二维码是正方形，边长每改 1 px，票的高度也改 1 px，所以直接把富余（负数是超出）加到边长上。
 * @param current 现在的边长
 * @param spare 可见区域减去内容总高：正数是富余，负数是超出
 * @param max 上限（默认宽度：屏宽的一半左右、最多 200）
 */
export function fitQrSize({
  current,
  spare,
  max,
}: {
  current: number;
  spare: number;
  max: number;
}): number {
  // 往下取整：四舍五入可能多出半个像素，内容就比一屏高一点，页面能多滚 1 px。
  return Math.floor(Math.min(max, Math.max(minQrSize, current + spare)));
}
