import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * 生成 TrainLink 的 App 图标（H 风车，设计稿见 Figma「App icon · H 风车 定稿」）。
 * 几何只在这里定义一次，SVG 与各尺寸 PNG 都由它生成：`npm run icons`。
 *
 * 风车：上、右、下、左四条矩形依次旋转 90° 排列，中间留出空心方块（枢纽）。
 * 画布 1024；T 为总边长，S 为条宽，g 为间隙，r 为圆角。
 */

interface Pinwheel {
  background: string;
  /** 上、右、下、左四条的颜色。 */
  colors: [string, string, string, string];
  T: number;
  S: number;
  g: number;
  r: number;
}

/** 线路色取自 Fetarute 线路：大都会线、浦蓝线、探索线，第四条用白色。 */
const lineColors: Pinwheel["colors"] = ["#D920D9", "#70DEEE", "#F6A000", "#FFFFFF"];
const ink = "#1B2022";

/** 标准：iOS / 桌面 / apple-touch-icon。iOS 会自己裁圆角，所以背景铺满。 */
const standard: Pinwheel = { background: ink, colors: lineColors, T: 660, S: 212, g: 28, r: 28 };
/** 自适应（PWA maskable / Android）：内容缩进到中心 80% 圆的安全区内。 */
const maskable: Pinwheel = { background: ink, colors: lineColors, T: 540, S: 174, g: 24, r: 22 };
/** 浏览器标签专用：几乎占满、间隙加大、无圆角，16 px 下仍能看出四块。 */
const favicon: Pinwheel = { background: ink, colors: lineColors, T: 900, S: 300, g: 72, r: 0 };

function pinwheelSvg({ background, colors, T, S, g, r }: Pinwheel): string {
  const N = 1024;
  const x0 = (N - T) / 2;
  const L = T - S;
  const bars: [number, number, number, number][] = [
    [x0, x0, L - g, S], // 上
    [x0 + L, x0, S, L - g], // 右
    [x0 + S + g, x0 + L, L - g, S], // 下
    [x0, x0 + S + g, S, L - g], // 左
  ];
  const rects = bars
    .map(
      ([x, y, w, h], i) =>
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${colors[i]}"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}"><rect width="${N}" height="${N}" fill="${background}"/>${rects}</svg>\n`;
}

const outDir = fileURLToPath(new URL("../public/icons/", import.meta.url));

async function png(svg: string, size: number, file: string) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(outDir + file);
}

await mkdir(outDir, { recursive: true });
const standardSvg = pinwheelSvg(standard);
const maskableSvg = pinwheelSvg(maskable);
const faviconSvg = pinwheelSvg(favicon);

await writeFile(outDir + "icon.svg", standardSvg);
await writeFile(outDir + "favicon.svg", faviconSvg);
await png(standardSvg, 192, "icon-192.png");
await png(standardSvg, 512, "icon-512.png");
await png(standardSvg, 180, "apple-touch-icon.png");
await png(maskableSvg, 512, "maskable-512.png");
await png(faviconSvg, 32, "favicon-32.png");

console.log("已生成 public/icons/ 下的图标");
