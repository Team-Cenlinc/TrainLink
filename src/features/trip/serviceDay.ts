/**
 * 运营日时钟：时刻表用「运营日 0 点起的秒数」，这里把当前时刻换算过去。
 * 按服务器时区（GTFS agency_timezone，与站牌 API 的 timezone 相同）计算，与浏览器所在时区无关。
 */

const formats = new Map<string, Intl.DateTimeFormat>();

export function serviceClock(now: number, timeZone: string): { dayStart: number; seconds: number } {
  let format = formats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formats.set(timeZone, format);
  }
  const part = (type: string) =>
    Number(format.formatToParts(now).find((p) => p.type === type)?.value ?? 0);
  const seconds = part("hour") * 3600 + part("minute") * 60 + part("second");
  const dayStart = Math.floor(now / 1000) * 1000 - seconds * 1000;
  return { dayStart, seconds };
}

const day = 86400;
/** 指定的时刻刚过去这么久以内仍算今天：多半是选时间时慢了一点，而不是指明天。 */
const pastGraceSeconds = 10 * 60;

/**
 * 「指定时间」指哪一天：还没到（或刚过去几分钟）是今天；比现在早的时刻指下一次到来的那个，
 * 也就是明天。深夜 23:30 指定 00:30，就是今晚过了午夜、明天运营日的 00:30。
 * @returns 0 今天，1 明天
 */
export function dayOffsetOf(at: number, nowSeconds: number): 0 | 1 {
  return at >= nowSeconds - pastGraceSeconds ? 0 : 1;
}

/**
 * 「指定时间」查的那一天的运营日 0 点（毫秒）：今天，或比现在早时的明天。
 * @param now 现在的绝对时刻（毫秒）。
 */
export function departureDayStart(at: number, now: number, timeZone: string): number {
  const clock = serviceClock(now, timeZone);
  if (dayOffsetOf(at, clock.seconds) === 0) return clock.dayStart;
  // 明天中午所在那天的 0 点；不直接加 24 小时，免得遇上夏令时差一小时。
  return serviceClock(clock.dayStart + 36 * 3600_000, timeZone).dayStart;
}

/** "08:30" → 运营日内的秒数；不是有效时刻时返回 undefined。 */
export function secondsOfClock(value: string | null): number | undefined {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  return hours < 24 && minutes < 60 ? hours * 3600 + minutes * 60 : undefined;
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** 某一时刻在服务器时区是哪一天："2026-11-01"。 */
export function serviceDate(time: number, timeZone: string): string {
  let format = dateFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dateFormats.set(timeZone, format);
  }
  const part = (type: string) => format.formatToParts(time).find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** "2026-11-01" → 这一天运营日 0 点的绝对时刻（毫秒）；不是日期时返回 undefined。 */
export function dayStartOf(date: string | null, timeZone: string): number | undefined {
  const match = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // 先取那天 UTC 中午，换到服务器时区若差了一天就挪回来，再取当天 0 点。
  let noon = utc + 12 * 3600_000;
  const shown = Date.parse(serviceDate(noon, timeZone));
  if (Number.isNaN(shown)) return undefined;
  noon += utc - shown;
  return serviceClock(noon, timeZone).dayStart;
}

/** 运营日的叫法：今天、明天，再往后写日期「11月2日」。 */
export function dayLabel(dayStart: number, todayStart: number, timeZone: string): string {
  const offset = Math.round((dayStart - todayStart) / (day * 1000));
  if (offset === 0) return "今天";
  if (offset === 1) return "明天";
  const [, month, date] = serviceDate(dayStart + 12 * 3600_000, timeZone)
    .split("-")
    .map(Number);
  return `${month}月${date}日`;
}

/** 运营日内的秒数 → "HH:MM"（过了午夜按 24 小时取余）。 */
export function clockOf(seconds: number): string {
  const inDay = ((seconds % day) + day) % day;
  const hh = String(Math.floor(inDay / 3600)).padStart(2, "0");
  const mm = String(Math.floor((inDay % 3600) / 60)).padStart(2, "0");
  return `${hh}:${mm}`;
}
