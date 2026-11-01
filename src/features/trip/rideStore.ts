import { useSyncExternalStore } from "react";
import { clearReminders } from "./reminders.ts";

/**
 * 正在进行的乘车 GO：同一时间只有一趟。存在浏览器本地，App 被系统关掉、重新打开后还能回到它，
 * 其他页面也能显示「乘车中」迷你条（RideBar）。写法同 ticketStore.ts。
 */

export interface ActiveRide {
  /** GO 页面的地址（带着找回这个方案的参数）。 */
  href: string;
  /** 预计到达（毫秒）：到了以后重开 App 不再自动回到 GO。 */
  arrival: number;
  /** 到什么时候为止（毫秒）：预计到达之后再留一段，过了就当这趟坐完了。 */
  until: number;
}

const key = "trainlink.activeRide";

/** 读出保存的乘车；坏数据、已经过了结束时刻的当作没有。 */
export function parseActiveRide(text: string | null, now: number): ActiveRide | undefined {
  try {
    const parsed = JSON.parse(text ?? "null") as Partial<ActiveRide> | null;
    if (typeof parsed?.href !== "string" || typeof parsed.until !== "number") return undefined;
    // 之前一版没有 arrival：按结束时刻当作到达。
    const arrival = typeof parsed.arrival === "number" ? parsed.arrival : parsed.until;
    return now <= parsed.until ? { href: parsed.href, arrival, until: parsed.until } : undefined;
  } catch {
    return undefined;
  }
}

/** 一趟乘车的身份：GO 地址里的起终点、日期、出发时刻与车次（不管参数顺序）。 */
export function rideKey(href: string): string {
  const params = new URLSearchParams(href.split("?")[1] ?? "");
  return ["from", "to", "date", "dep", "trip"].map((name) => params.get(name) ?? "").join("|");
}

/** 重开 App 时要不要自动回到 GO：只有还没到站时才回；到了就留在看板（迷你条仍在，点了能回去）。 */
export function shouldResume(ride: ActiveRide | undefined, now: number): boolean {
  return !!ride && now < ride.arrival;
}

/** 一趟乘车 GO 的下车提醒的 key 前缀（见 reminders.ts）：结束或改乘时按它一起取消。 */
export function rideReminderPrefix(href: string): string {
  return `go-${rideKey(href)}`;
}

function load(): ActiveRide | undefined {
  try {
    return parseActiveRide(localStorage.getItem(key), Date.now());
  } catch {
    return undefined;
  }
}

let ride = load();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** 到了结束时刻自己消失：迷你条等不用等到下一次切换页面。 */
let expiry: number | undefined;
function scheduleExpiry() {
  if (typeof window === "undefined") return;
  window.clearTimeout(expiry);
  if (!ride) return;
  // setTimeout 最长约 24.8 天，这里远远不到。
  expiry = window.setTimeout(notify, Math.max(0, ride.until - Date.now()) + 50);
}
scheduleExpiry();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function save() {
  try {
    if (ride) localStorage.setItem(key, JSON.stringify(ride));
    else localStorage.removeItem(key);
  } catch {
    // 存不下也不影响本次使用。
  }
}

// 另一个标签页开始或结束了乘车：跟着更新。
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    ride = load();
    scheduleExpiry();
    notify();
  });
}

/**
 * 开始（或更新）这一趟：同一趟只更新到达与结束时刻（晚点了往后挪）；
 * 不同的一趟替换掉原来的，原来那趟设好的下车提醒一起取消。
 */
export function startRide(next: ActiveRide) {
  if (ride && ride.href === next.href && ride.until === next.until && ride.arrival === next.arrival)
    return;
  if (ride && rideKey(ride.href) !== rideKey(next.href))
    clearReminders(rideReminderPrefix(ride.href));
  ride = next;
  save();
  scheduleExpiry();
  notify();
}

/** 结束乘车（GO 的「结束乘车」「完成」）：这趟的下车提醒一起取消。 */
export function endRide() {
  if (!ride) return;
  clearReminders(rideReminderPrefix(ride.href));
  ride = undefined;
  save();
  scheduleExpiry();
  notify();
}

/** 正在进行的乘车；过了结束时刻自动当作没有（每次读都检查）。 */
export function useActiveRide(): ActiveRide | undefined {
  return useSyncExternalStore(subscribe, () =>
    ride && Date.now() <= ride.until ? ride : undefined,
  );
}
