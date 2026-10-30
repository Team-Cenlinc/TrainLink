/** 按时区缓存的格式器；Intl.DateTimeFormat 创建成本较高，不在每次渲染时新建。 */
const clockFormats = new Map<string, Intl.DateTimeFormat>();

/**
 * 把时间戳格式化为 24 小时制「时:分」，例如 22:20。
 * 时刻按服务器时区显示，与游戏内站牌一致，而不是看的人所在的时区。
 */
export function formatClock(epochMillis: number, timeZone: string): string {
  let format = clockFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("zh-Hans", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    });
    clockFormats.set(timeZone, format);
  }
  return format.format(epochMillis);
}
