/**
 * 出发提醒：到点用系统通知提醒（Notification API）。
 * 纯 Web 没有服务器推送，提醒只在 TrainLink 开着（前台或后台标签页）时有效；关掉页面就不会响。
 * 定时器放在模块里，在 App 内切换页面不会丢。
 */

const timers = new Map<string, number>();

export type ReminderResult = "set" | "denied" | "unsupported" | "past";

export function hasReminder(key: string): boolean {
  return timers.has(key);
}

export function clearReminder(key: string) {
  window.clearTimeout(timers.get(key));
  timers.delete(key);
}

export async function setReminder(
  key: string,
  fireAt: number,
  title: string,
  body: string,
): Promise<ReminderResult> {
  if (!("Notification" in window)) return "unsupported";
  const delay = fireAt - Date.now();
  if (delay <= 0) return "past";
  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== "granted") return "denied";
  clearReminder(key);
  timers.set(
    key,
    window.setTimeout(() => {
      timers.delete(key);
      new Notification(title, { body, icon: "/icons/icon-192.png", tag: key });
    }, delay),
  );
  return "set";
}
