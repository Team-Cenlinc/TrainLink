import type { HomeStation } from "@/lib/homeStation.ts";
import { clockOf, serviceClock } from "@/features/trip/serviceDay.ts";

/**
 * 仿真车票（不接入任何真实系统，仅供体验）：仿照 JR 东日本 TrainTime / えきねっと Q チケ 的二维码数字票。
 * 一张票对应一段行程，当天有效；在起点「模拟进站」、在终点「模拟出站」，用过即作废。
 * 纯函数，不涉及 React；票夹的保存在 ticketStore.ts。
 */

export interface Ticket {
  /** 票号，例如 TL-1031-1218-7Q2K（运营日、出发时刻、由出票时刻换算的后缀）。 */
  id: string;
  from: HomeStation;
  to: HomeStation;
  /** 计划出发与到达，运营日内的秒数。 */
  departure: number;
  arrival: number;
  lineCodes: string[];
  /** 出票时刻（毫秒）。 */
  issuedAt: number;
  /** 有效期至（毫秒）：所属运营日结束，即次日 04:00（凌晨的车次是当天 04:00）。 */
  validUntil: number;
  /** 模拟进站：车站与时刻。 */
  entry?: GatePass;
  /** 模拟出站：车站与时刻。出站后这张票就用过了。 */
  exit?: GatePass;
}

export interface GatePass {
  station: string;
  at: number;
}

export type TicketState = "unused" | "entered" | "exited" | "expired";

/** 闸机的结果：通过时给出更新后的票，不通过时给出原因（闸机屏幕上显示）。 */
export type GateResult = { ok: true; ticket: Ticket } | { ok: false; reason: GateRefusal };

export type GateRefusal = "wrongStation" | "alreadyEntered" | "notEntered" | "used" | "expired";

/** 运营日在次日几点结束：04:00，覆盖午夜以后的末班车。 */
const dayEndHour = 4;

export function issueTicket(input: {
  route: { from: HomeStation; to: HomeStation };
  journey: { departure: number; arrival: number; lineCodes: string[] };
  now: number;
  dayStart: number;
  timeZone: string;
}): Ticket {
  // 有效到行程到达之后的第一个 04:00：凌晨的车次还属于前一运营日，当天 04:00 就结束；
  // 其余到次日 04:00。只看行程，不看出票时刻，提前买明天的票也一样。
  const arrivesAt = input.dayStart + input.journey.arrival * 1000;
  const sameNight = localHour(input.dayStart, dayEndHour, input.timeZone);
  const validUntil =
    arrivesAt <= sameNight ? sameNight : localHour(input.dayStart, 24 + dayEndHour, input.timeZone);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: input.timeZone,
    month: "2-digit",
    day: "2-digit",
  })
    // 所属运营日的日期：有效期结束前 16 小时一定落在那一天的白天。
    .format(validUntil - 16 * 3600_000)
    .replace("-", "");
  const suffix = (input.now % 36 ** 4).toString(36).toUpperCase().padStart(4, "0");
  return {
    id: `TL-${date}-${clockOf(input.journey.departure).replace(":", "")}-${suffix}`,
    from: input.route.from,
    to: input.route.to,
    departure: input.journey.departure,
    arrival: input.journey.arrival,
    lineCodes: input.journey.lineCodes,
    issuedAt: input.now,
    validUntil,
  };
}

/**
 * 运营日 0 点之后第几个小时的当地整点。直接加小时数在夏令时切换的那一夜会差一小时，
 * 所以按当地时钟读出实际是几点，再把差值补回来。
 */
function localHour(dayStart: number, hours: number, timeZone: string): number {
  const guess = dayStart + hours * 3600_000;
  const drift = serviceClock(guess, timeZone).seconds - (hours % 24) * 3600;
  return guess - drift * 1000;
}

/** 票的状态。出过站的票一直算「已出站」（留作记录）；其余过了有效期就「已失效」。 */
export function ticketState(ticket: Ticket, now: number): TicketState {
  if (ticket.exit) return "exited";
  if (now > ticket.validUntil) return "expired";
  return ticket.entry ? "entered" : "unused";
}

/** 模拟进站：只能在这张票的起点。 */
export function enterGate(ticket: Ticket, station: string, now: number): GateResult {
  if (ticket.exit) return { ok: false, reason: "used" };
  if (now > ticket.validUntil) return { ok: false, reason: "expired" };
  if (ticket.entry) return { ok: false, reason: "alreadyEntered" };
  if (station !== ticket.from.stationCode) return { ok: false, reason: "wrongStation" };
  return { ok: true, ticket: { ...ticket, entry: { station, at: now } } };
}

/** 模拟出站：必须先进站，只能在这张票的终点。 */
export function exitGate(ticket: Ticket, station: string, now: number): GateResult {
  if (ticket.exit) return { ok: false, reason: "used" };
  if (now > ticket.validUntil) return { ok: false, reason: "expired" };
  if (!ticket.entry) return { ok: false, reason: "notEntered" };
  if (station !== ticket.to.stationCode) return { ok: false, reason: "wrongStation" };
  return { ok: true, ticket: { ...ticket, exit: { station, at: now } } };
}

/** 动态二维码多久换一次。 */
export const qrWindowMs = 30_000;

/** FNV-1a 32 位散列，转成 36 进制：给二维码内容加一段随时间窗变化的校验码（仿真，不是加密）。 */
function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).toUpperCase();
}

/**
 * 二维码内容：TRAINLINK-SIM|票号|状态|时间窗|校验码。时间窗每 30 秒加一，
 * 像真实的动态码一样，截图过一会儿就对不上了。内容只是这些文字，不链接任何地址。
 */
export function qrPayload(ticket: Ticket, now: number): string {
  const window = Math.floor(now / qrWindowMs);
  const body = `TRAINLINK-SIM|${ticket.id}|${ticketState(ticket, now)}|${window}`;
  return `${body}|${checksum(body)}`;
}
