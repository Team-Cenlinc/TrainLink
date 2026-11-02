import type { HomeStation } from "@/lib/homeStation.ts";
import { serviceClock, serviceDate } from "@/features/trip/serviceDay.ts";

/**
 * 仿真车票（不接入任何真实系统，仅供体验）：仿照 JR 东日本 TrainTime / えきねっと Q チケ 的二维码数字票。
 * 区间票：一张票对应两站之间，当天（到次日 04:00）任意班次都能坐，不绑定车次；
 * 在起点「模拟进站」、在终点「模拟出站」，用过即作废。
 * 纯函数，不涉及 React；票夹的保存在 ticketStore.ts。
 */

export interface Ticket {
  /** 票号，例如 TL-1031-PTK-NTA-7Q2K（运营日、起终点、由出票时刻换算的后缀）。 */
  id: string;
  from: HomeStation;
  to: HomeStation;
  /** 旧版本按班次出的票才有：计划出发与到达，运营日内的秒数。区间票没有。 */
  departure?: number;
  arrival?: number;
  /** 两站之间要坐的线路（出票时那个方案的），票面色带用。 */
  lineCodes: string[];
  /** 出票时刻（毫秒）。 */
  issuedAt: number;
  /** 有效期至（毫秒）：所属运营日结束，即次日 04:00（凌晨的车次是当天 04:00）。 */
  validUntil: number;
  /** 模拟进站：车站与时刻。 */
  entry?: GatePass;
  /** 模拟出站：车站与时刻。出站后这张票就用过了。 */
  exit?: GatePass;
  /**
   * 出票时选的方案：那一天（"2026-10-31"）、计划出发时刻与第一段乘车的车次。
   * 票不绑定它（换坐别的班次照样能用），只是进站后据此直接接着乘车 GO。旧版本的票、只步行的方案没有。
   */
  ride?: {
    date: string;
    /** 区间票之前的一版没有（出发时刻在票上的 departure）。 */
    departure?: number;
    tripId: string;
  };
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
  journey: { departure: number; arrival: number; lineCodes: string[]; tripId?: string };
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
  const { from, to } = input.route;
  return {
    id: `TL-${date}-${from.stationCode}-${to.stationCode}-${suffix}`,
    from,
    to,
    lineCodes: input.journey.lineCodes,
    issuedAt: input.now,
    validUntil,
    ...(input.journey.tripId && {
      ride: {
        date: serviceDate(input.dayStart, input.timeZone),
        departure: input.journey.departure,
        tripId: input.journey.tripId,
      },
    }),
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

/** 两张票（或一张票与一段行程）是不是同一段区间：同一台服务器上的同一对起终点。 */
export function sameSection(
  a: { from: HomeStation; to: HomeStation },
  b: { from: HomeStation; to: HomeStation },
): boolean {
  return (
    a.from.serverId === b.from.serverId &&
    a.from.stationCode === b.from.stationCode &&
    a.to.stationCode === b.to.stationCode
  );
}

/**
 * 这一段区间（起终点）能用的票：还没出站、到乘车那一刻也还没失效。不看班次，区间票哪一班都能坐。
 * @param at 乘车的时刻（毫秒）：今天的票次日 04:00 失效，明天的行程就用不了它。
 */
export function ticketFor(
  tickets: Ticket[],
  route: { from: HomeStation; to: HomeStation },
  at: number,
): Ticket | undefined {
  return tickets.find(
    (t) => sameSection(t, route) && ["unused", "entered"].includes(ticketState(t, at)),
  );
}

/**
 * 这一趟已经坐完（出过站）的票，同一区间里满足其一：
 * - 为这一趟出的票（ticket.ride 就是这个方案）：提前坐了早一班、出发前就模拟出了站也算；
 * - 在这一趟计划出发之后才出的站（在别处出的票）。
 * 之前坐过同一区间的票不算——再坐一趟要另取一张。
 * @param plan 这一趟的方案：运营日、计划出发时刻（秒）、第一段乘车的车次，同 ticket.ride；
 *   不知道是哪一天（date 为 null）时只看出站时刻。
 * @param dayStart 那个运营日 0 点（毫秒）。
 */
export function usedTicketFor(
  tickets: Ticket[],
  route: { from: HomeStation; to: HomeStation },
  plan: { date: string | null; departure: number; tripId?: string },
  dayStart: number,
): Ticket | undefined {
  const departsAt = dayStart + plan.departure * 1000;
  const forThisRide = (ride: Ticket["ride"]) =>
    !!ride &&
    ride.date === plan.date &&
    ride.departure === plan.departure &&
    ride.tripId === plan.tripId;
  return tickets.find(
    (t) => sameSection(t, route) && t.exit && (forThisRide(t.ride) || t.exit.at >= departsAt),
  );
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
