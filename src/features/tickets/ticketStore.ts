import { useSyncExternalStore } from "react";
import type { GatePass, Ticket } from "./ticket.ts";

/**
 * 票夹：生成过的仿真车票，保存在浏览器本地（写法同 lib/homeStation.ts）。
 * 进站、出站后整张票替换成新的状态。别的标签页改了票夹，这里跟着更新。
 */

const key = "trainlink.tickets";
/** 最多留多少张（新的在前），旧的自动丢掉。 */
const limit = 50;

type Loose<T> = { [K in keyof T]?: unknown };

const isStation = (value: unknown) => {
  const s = value as Loose<Ticket["from"]> | null;
  return (
    typeof s?.serverId === "string" &&
    typeof s.operatorCode === "string" &&
    typeof s.stationCode === "string"
  );
};

const isPass = (value: unknown) => {
  const p = value as Loose<GatePass> | null | undefined;
  return p === undefined || (typeof p?.station === "string" && typeof p.at === "number");
};

const isOptionalNumber = (value: unknown) => value === undefined || typeof value === "number";

const isRide = (value: unknown) => {
  const r = value as Loose<NonNullable<Ticket["ride"]>> | null | undefined;
  return (
    r === undefined ||
    (typeof r?.date === "string" && isOptionalNumber(r.departure) && typeof r.tripId === "string")
  );
};

/** 逐张检查字段：本地存储可能被旧版本或手动改坏，坏的那张跳过，不让整个票夹打不开。 */
function isTicket(value: unknown): value is Ticket {
  const t = value as Loose<Ticket> | null;
  return (
    typeof t?.id === "string" &&
    isStation(t.from) &&
    isStation(t.to) &&
    isOptionalNumber(t.departure) &&
    isOptionalNumber(t.arrival) &&
    Array.isArray(t.lineCodes) &&
    t.lineCodes.every((code) => typeof code === "string") &&
    typeof t.issuedAt === "number" &&
    typeof t.validUntil === "number" &&
    isPass(t.entry) &&
    isPass(t.exit) &&
    isRide(t.ride)
  );
}

/** 读出本地存储里的票夹文字。 */
export function parseTickets(text: string | null): Ticket[] {
  try {
    const parsed: unknown = JSON.parse(text ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isTicket) : [];
  } catch {
    return [];
  }
}

function load(): Ticket[] {
  try {
    return parseTickets(localStorage.getItem(key));
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(key, JSON.stringify(tickets));
  } catch {
    // 存不下也不影响本次使用。
  }
}

let tickets = load();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// 另一个标签页保存了票夹（storage 事件只发给别的标签页）：重新读一遍，免得这里再保存时把它覆盖掉。
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    tickets = load();
    notify();
  });
}

export function addTicket(ticket: Ticket) {
  tickets = [ticket, ...tickets].slice(0, limit);
  save();
  notify();
}

/** 进站、出站后保存新的票。 */
export function updateTicket(ticket: Ticket) {
  tickets = tickets.map((t) => (t.id === ticket.id ? ticket : t));
  save();
  notify();
}

/** 清空票夹（设置页「清除本地数据」）。 */
export function clearTickets() {
  tickets = [];
  save();
  notify();
}

export function useTickets(): Ticket[] {
  return useSyncExternalStore(subscribe, () => tickets);
}
