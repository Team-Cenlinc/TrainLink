/**
 * 让文字在行框里上下居中：改写 Noto Sans SC 与 Noto Sans Display 的上下行距。
 *
 * 两款字体自带的上行距比下行距多，字面落在行框中心偏下：汉字低 0.056 em，
 * Display 的大写字母（线路码、站码）与数字低 0.031 em。标签、按钮这类固定高度、
 * 文字居中的元素里看得出来（12 px 的标签低约 0.7 px）。
 * 这里按字面中心重新分配上下行距，上下之和不变，所以行高与排版都不变，只是字面落到正中：
 * - Noto Sans SC：原 116% / 28.8%，汉字字面中心在基线上 0.38 em → 110.4% / 34.4%；
 * - Noto Sans Display：原 106.9% / 29.3%，大写高 0.714 em → 103.8% / 32.4%。
 *
 * Google Fonts 的样式表不能直接加这两项，所以取回同一份样式表，给每个 @font-face 补上后
 * 插在它后面：后声明的同名字体规则优先，字体文件仍是同一批，浏览器缓存照用。
 */

const overrides: Record<string, string> = {
  "Noto Sans SC": "ascent-override: 110.4%; descent-override: 34.4%;",
  "Noto Sans Display": "ascent-override: 103.8%; descent-override: 32.4%;",
};

/** 给样式表里这两款字体的每个 @font-face 补上行距；别的字体原样保留。 */
export function withCenteredMetrics(css: string): string {
  return css.replace(/@font-face\s*\{[^}]*\}/g, (block) => {
    const family = Object.keys(overrides).find((name) =>
      new RegExp(`font-family:\\s*['"]${name}['"]`).test(block),
    );
    return family ? block.replace(/\}$/, `  ${overrides[family]}\n}`) : block;
  });
}

/** 取回页面里的 Google Fonts 样式表，补上行距后插进页面。取不到就保持原样（只是略偏下）。 */
export async function centerFontMetrics() {
  const link = document.querySelector<HTMLLinkElement>(
    'link[rel="stylesheet"][href^="https://fonts.googleapis.com/"]',
  );
  if (!link) return;
  try {
    const response = await fetch(link.href);
    if (!response.ok) return;
    const style = document.createElement("style");
    style.textContent = withCenteredMetrics(await response.text());
    link.after(style);
  } catch {
    // 离线或被拦截：用原来的字体规则。
  }
}
