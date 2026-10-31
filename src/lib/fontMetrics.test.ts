import { describe, expect, it } from "vitest";
import { withCenteredMetrics } from "./fontMetrics.ts";

const css = `/* chinese-simplified */
@font-face {
  font-family: 'Noto Sans SC';
  font-style: normal;
  font-weight: 700;
  src: url(https://fonts.gstatic.com/s/notosanssc/a.woff2) format('woff2');
  unicode-range: U+4E00-9FFF;
}
/* latin */
@font-face {
  font-family: 'Noto Sans Display';
  font-weight: 800;
  src: url(https://fonts.gstatic.com/s/notosansdisplay/b.woff2) format('woff2');
}
@font-face {
  font-family: 'Other';
  src: url(c.woff2);
}`;

describe("字体上下行距改写", () => {
  it("给两款字体的每个 @font-face 补上行距，上下之和与原来相同；别的字体不动", () => {
    const blocks = withCenteredMetrics(css).match(/@font-face\s*\{[^}]*\}/g) ?? [];

    expect(blocks[0]).toContain("ascent-override: 110.4%");
    expect(blocks[0]).toContain("descent-override: 34.4%");
    expect(blocks[0]).toContain("unicode-range: U+4E00-9FFF");
    expect(blocks[1]).toContain("ascent-override: 103.8%");
    expect(blocks[1]).toContain("descent-override: 32.4%");
    expect(blocks[2]).not.toContain("override");
  });
});
