import { useSyncExternalStore } from "react";

/**
 * 出发提醒：到点用系统通知提醒（Notification API）。
 * 纯 Web 没有服务器推送，提醒只在 TrainLink 开着（前台或后台标签页）时有效；关掉页面就不会响。
 * 定时器放在模块里，在 App 内切换页面不会丢；组件用 useReminder 订阅，设好、取消、响过都会更新。
 */

const timers = new Map<string, number>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export type ReminderResult = "set" | "denied" | "unsupported" | "past";

/** 这个提醒是否设好了（还没响）；换了 key 或提醒响过、取消后跟着变。 */
export function useReminder(key: string): boolean {
  return useSyncExternalStore(subscribe, () => timers.has(key));
}

/** 这几个提醒里有没有还没响的（一组提醒，例如 GO 的各段下车提醒）。 */
export function useAnyReminder(keys: string[]): boolean {
  return useSyncExternalStore(subscribe, () => keys.some((key) => timers.has(key)));
}

/** 取消一组提醒（key 以 prefix 开头的），例如某趟乘车 GO 的各段下车提醒。 */
export function clearReminders(prefix: string) {
  for (const key of [...timers.keys()]) if (key.startsWith(prefix)) clearReminder(key);
}

export function clearReminder(key: string) {
  window.clearTimeout(timers.get(key));
  timers.delete(key);
  notify();
}

/** 通过 Service Worker 发通知（安卓 Chrome 只认这种）；还没注册 Service Worker 时为 undefined。 */
async function serviceWorkerRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  try {
    return await navigator.serviceWorker?.getRegistration();
  } catch {
    return undefined;
  }
}

/**
 * 安卓上的浏览器不允许直接 new Notification（会抛错），只能通过 Service Worker 发通知。
 * 构造一次来试会真的弹出通知，所以按系统判断。
 */
const constructorBlocked = () => /Android/i.test(navigator.userAgent);

async function show(key: string, title: string, body: string) {
  const options: NotificationOptions = { body, icon: "/icons/icon-192.png", tag: key };
  const registration = await serviceWorkerRegistration();
  if (registration) {
    await registration.showNotification(title, options).catch(() => undefined);
    return;
  }
  try {
    new Notification(title, options);
  } catch {
    // 这个浏览器不允许直接发通知；设提醒时已经尽量判断过，这里只能放弃。
  }
}

export async function setReminder(
  key: string,
  fireAt: number,
  title: string,
  body: string,
): Promise<ReminderResult> {
  if (!("Notification" in window)) return "unsupported";
  if (constructorBlocked() && !(await serviceWorkerRegistration())) return "unsupported";
  const delay = fireAt - Date.now();
  if (delay <= 0) return "past";
  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== "granted") return "denied";
  window.clearTimeout(timers.get(key));
  timers.set(
    key,
    window.setTimeout(() => {
      timers.delete(key);
      notify();
      void show(key, title, body);
    }, delay),
  );
  notify();
  return "set";
}
