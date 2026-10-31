import { describe, expect, it } from "vitest";
import { serviceClock } from "./serviceDay.ts";

describe("serviceClock", () => {
  it("按服务器时区算出当天 0 点与 0 点起的秒数（与浏览器所在时区无关）", () => {
    // 2026-10-31 02:30:15 UTC = 上海 10:30:15。
    const now = Date.UTC(2026, 9, 31, 2, 30, 15, 500);

    const clock = serviceClock(now, "Asia/Shanghai");

    expect(clock.seconds).toBe(10 * 3600 + 30 * 60 + 15);
    expect(clock.dayStart).toBe(Date.UTC(2026, 9, 30, 16, 0, 0));
  });
});
