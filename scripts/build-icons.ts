import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * 生成 TrainLink 的 App 图标（H 风车，设计稿见 Figma「App icon · H 风车 定稿」）、
 * favicon.ico 与分享卡片图（og-image.png）。
 * 几何只在这里定义一次，SVG 与各尺寸 PNG 都由它生成：`npm run icons`。
 * 分享图的文字用 Noto Sans Display / Noto Sans SC 渲染，生成前本机需装有这两款字体。
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
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));

async function png(svg: string, size: number, file: string) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(outDir + file);
}

/**
 * favicon.ico：把几个尺寸的 PNG 原样装进一个 ICO（Vista 起的 ICO 可以直接内嵌 PNG）。
 * 浏览器和不少爬虫不看 <link rel="icon">，直接请求站点根目录的 /favicon.ico。
 */
async function ico(svg: string, sizes: number[], file: string) {
  const images = await Promise.all(
    sizes.map((size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()),
  );
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); // 保留
  header.writeUInt16LE(1, 2); // 1 = 图标
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((image, i) => {
    const entry = 6 + 16 * i;
    const size = sizes[i] ?? 0;
    header.writeUInt8(size >= 256 ? 0 : size, entry); // 宽，256 记作 0
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1); // 高
    header.writeUInt16LE(1, entry + 4); // 色彩平面
    header.writeUInt16LE(32, entry + 6); // 每像素位数
    header.writeUInt32LE(image.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  await writeFile(publicDir + file, Buffer.concat([header, ...images]));
}

/**
 * 分享卡片（Open Graph / Twitter，1200×630）：深色底，左边风车图标，右边「TrainLink」、一句主张与功能，
 * 底边一条四色线路色带（同车票顶部的色带）。
 */
function shareCardSvg(icon: string): string {
  const W = 1200;
  const H = 630;
  const iconSize = 300;
  const iconX = 110;
  const iconY = (H - iconSize) / 2 - 10;
  const inner = icon.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const band = lineColors
    .map(
      (color, i) =>
        `<rect x="${(W / 4) * i}" y="${H - 18}" width="${W / 4}" height="18" fill="${color}"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="${ink}"/>
<svg x="${iconX}" y="${iconY}" width="${iconSize}" height="${iconSize}" viewBox="0 0 1024 1024">${inner}</svg>
<text x="490" y="300" fill="#EEF0EF" font-family="Noto Sans Display" font-weight="800" font-size="112" letter-spacing="-2">TrainLink</text>
<text x="494" y="384" fill="#EEF0EF" font-family="Noto Sans SC" font-weight="900" font-size="48">下一班车，一眼看清</text>
<text x="494" y="440" fill="#B2B8B9" font-family="Noto Sans SC" font-weight="500" font-size="28">实时发车 · 列车位置 · 行程规划 · 运行状态</text>
${band}
</svg>
`;
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
await ico(faviconSvg, [16, 32, 48], "favicon.ico");
await sharp(Buffer.from(shareCardSvg(standardSvg)))
  .png()
  .toFile(publicDir + "og-image.png");

console.log("已生成 public/icons/ 下的图标、public/favicon.ico 与 public/og-image.png");
