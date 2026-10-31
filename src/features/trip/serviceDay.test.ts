import { describe, expect, it } from "vitest";
import { at } from "./testTimetable.ts";
import {
  dayLabel,
  dayOffsetOf,
  dayStartOf,
  departureDayStart,
  secondsOfClock,
  serviceClock,
  serviceDate,
} from "./serviceDay.ts";

describe("serviceClock", () => {
  it("按服务器时区算出当天 0 点与 0 点起的秒数（与浏览器所在时区无关）", () => {
    // 2026-10-31 02:30:15 UTC = 上海 10:30:15。
    const now = Date.UTC(2026, 9, 31, 2, 30, 15, 500);

    const clock = serviceClock(now, "Asia/Shanghai");

    expect(clock.seconds).toBe(10 * 3600 + 30 * 60 + 15);
    expect(clock.dayStart).toBe(Date.UTC(2026, 9, 30, 16, 0, 0));
  });
});

describe("dayOffsetOf", () => {
  it("指定的时刻还没到：今天", () => {
    expect(dayOffsetOf(at("11:00"), at("10:30"))).toBe(0);
  });

  it("指定的时刻比现在早：指下一次到来的那个，也就是明天（深夜指定凌晨同理）", () => {
    expect(dayOffsetOf(at("08:00"), at("10:30"))).toBe(1);
    expect(dayOffsetOf(at("00:30"), at("23:30"))).toBe(1);
  });

  it("刚过去几分钟的时刻仍算今天（选时间时慢了一点）", () => {
    expect(dayOffsetOf(at("10:25"), at("10:30"))).toBe(0);
  });
});

describe("serviceDate 与 dayStartOf", () => {
  const timeZone = "Asia/Shanghai";
  const nov1 = Date.UTC(2026, 9, 31, 16, 0, 0);

  it("运营日 0 点 ↔ 日期（写进网址）", () => {
    expect(serviceDate(nov1, timeZone)).toBe("2026-11-01");
    expect(dayStartOf("2026-11-01", timeZone)).toBe(nov1);
  });

  it("不是日期时返回 undefined", () => {
    expect(dayStartOf("tomorrow", timeZone)).toBeUndefined();
    expect(dayStartOf(null, timeZone)).toBeUndefined();
  });
});

describe("dayLabel", () => {
  const timeZone = "Asia/Shanghai";
  const today = Date.UTC(2026, 9, 30, 16, 0, 0);

  it("今天、明天，再往后写日期", () => {
    expect(dayLabel(today, today, timeZone)).toBe("今天");
    expect(dayLabel(today + 86400_000, today, timeZone)).toBe("明天");
    expect(dayLabel(today + 2 * 86400_000, today, timeZone)).toBe("11月2日");
  });
});

describe("departureDayStart", () => {
  it("深夜 23:30 指定 00:30：查明天运营日（今晚过了午夜）", () => {
    // 2026-10-31 15:30 UTC = 上海 23:30。
    const now = Date.UTC(2026, 9, 31, 15, 30);

    expect(departureDayStart(at("00:30"), now, "Asia/Shanghai")).toBe(Date.UTC(2026, 9, 31, 16));
    expect(departureDayStart(at("23:45"), now, "Asia/Shanghai")).toBe(Date.UTC(2026, 9, 30, 16));
  });
});

describe("secondsOfClock", () => {
  it('"08:30" → 秒数；不是有效时刻（含空白）时返回 undefined', () => {
    expect(secondsOfClock("08:30")).toBe(at("08:30"));
    expect(secondsOfClock("")).toBeUndefined();
    expect(secondsOfClock("25:00")).toBeUndefined();
    expect(secondsOfClock(null)).toBeUndefined();
  });
});
