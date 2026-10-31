import { useMemo } from "react";
import { encode } from "uqr";

/**
 * 二维码：用 uqr 编码成模块矩阵，自己画成一条 SVG 路径（深色模块用 currentColor），
 * 四周留 2 格白边。容错等级 M，与常见乘车码相同。
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, path } = useMemo(() => {
    const { data, size } = encode(value, { ecc: "M", border: 0 });
    let d = "";
    data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x + 2} ${y + 2}h1v1h-1z`;
      }),
    );
    return { size: size + 4, path: d };
  }, [value]);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
