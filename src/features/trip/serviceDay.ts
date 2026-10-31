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

/** 运营日内的秒数 → "HH:MM"（过了午夜按 24 小时取余）。 */
export function clockOf(seconds: number): string {
  const day = ((seconds % 86400) + 86400) % 86400;
  const hh = String(Math.floor(day / 3600)).padStart(2, "0");
  const mm = String(Math.floor((day % 3600) / 60)).padStart(2, "0");
  return `${hh}:${mm}`;
}
