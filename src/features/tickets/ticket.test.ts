import { describe, expect, it } from "vitest";
import {
  enterGate,
  exitGate,
  issueTicket,
  qrPayload,
  ticketFor,
  ticketState,
  type Ticket,
} from "./ticket.ts";

/** 运营日 0 点（上海时间 2026-10-31 00:00）。 */
const dayStart = Date.UTC(2026, 9, 30, 16);
const hour = 3600_000;
const station = (code: string) => ({
  serverId: "survival",
  operatorCode: "SURC",
  stationCode: code,
});

function newTicket(now = dayStart + 12 * hour) {
  return issueTicket({
    route: { from: station("PTK"), to: station("NTA") },
    journey: {
      departure: 12 * 3600 + 18 * 60,
      arrival: 12 * 3600 + 36 * 60,
      lineCodes: ["MT", "WS"],
      tripId: "survival:SURC:MT:T:M1",
    },
    now,
    dayStart,
    timeZone: "Asia/Shanghai",
  });
}

describe("仿真车票", () => {
  it("区间票：新出的票「未入站」，票号带日期与起终点，当天运营结束（次日 04:00）前任意班次都能坐", () => {
    const ticket = newTicket();

    expect(ticketState(ticket, dayStart + 13 * hour)).toBe("unused");
    expect(ticket.id).toMatch(/^TL-1031-PTK-NTA-[0-9A-Z]{4}$/);
    expect(ticket.validUntil).toBe(dayStart + 28 * hour);
    // 不绑定班次：票上没有出发、到达时刻。
    expect(ticket).not.toHaveProperty("departure");
    expect(ticket).not.toHaveProperty("arrival");
  });

  it("记下出票时选的方案（那一天、出发时刻、第一段车次）：进站后直接接着乘车 GO", () => {
    expect(newTicket().ride).toEqual({
      date: "2026-10-31",
      departure: 12 * 3600 + 18 * 60,
      tripId: "survival:SURC:MT:T:M1",
    });
  });

  it("找这一段区间能用的票：起终点相同、还没出站也没失效；不看班次", () => {
    const now = dayStart + 13 * hour;
    const fresh = newTicket();
    const used = {
      ...newTicket(),
      id: "used",
      entry: { station: "PTK", at: now },
      exit: { station: "NTA", at: now },
    };
    const other: Ticket = { ...newTicket(), id: "other", to: station("HHU") };
    const route = { from: station("PTK"), to: station("NTA") };

    expect(ticketFor([used, other, fresh], route, now)?.id).toBe(fresh.id);
    expect(ticketFor([used, other], route, now)).toBeUndefined();
    expect(ticketFor([fresh], route, dayStart + 29 * hour)).toBeUndefined();
  });

  it("找票看服务器：另一台服务器上站码相同的票不算", () => {
    const route = {
      from: { ...station("PTK"), serverId: "creative" },
      to: { ...station("NTA"), serverId: "creative" },
    };
    expect(ticketFor([newTicket()], route, dayStart + 13 * hour)).toBeUndefined();
  });

  it("按乘车的时刻判断：明天的行程不用今天就失效的票", () => {
    const route = { from: station("PTK"), to: station("NTA") };
    // 今天的票次日 04:00 失效；明天中午的车用不了它。
    expect(ticketFor([newTicket()], route, dayStart + 36 * hour)).toBeUndefined();
  });

  it("只能在起点进站：进站后状态变「已入站」，记下车站与时刻；在别的站进站被拒绝", () => {
    const ticket = newTicket();
    const at = dayStart + 12 * hour + 10 * 60_000;

    const wrong = enterGate(ticket, "HHU", at);
    const right = enterGate(ticket, "PTK", at);

    expect(wrong).toEqual({ ok: false, reason: "wrongStation" });
    expect(right.ok && ticketState(right.ticket, at)).toBe("entered");
    expect(right.ok && right.ticket.entry).toEqual({ station: "PTK", at });
  });

  it("不能重复进站；没进站不能出站", () => {
    const at = dayStart + 12 * hour + 10 * 60_000;
    const entered = enterGate(newTicket(), "PTK", at);

    expect(entered.ok && enterGate(entered.ticket, "PTK", at + 60_000)).toEqual({
      ok: false,
      reason: "alreadyEntered",
    });
    expect(exitGate(newTicket(), "NTA", at)).toEqual({ ok: false, reason: "notEntered" });
  });

  it("只能在终点出站：出站后「已出站」，记下车站与时刻，不能再进站", () => {
    const at = dayStart + 12 * hour + 10 * 60_000;
    const entered = enterGate(newTicket(), "PTK", at);
    if (!entered.ok) throw new Error("应能进站");

    const wrong = exitGate(entered.ticket, "HHU", at + 20 * 60_000);
    const exited = exitGate(entered.ticket, "NTA", at + 30 * 60_000);
    if (!exited.ok) throw new Error("应能出站");

    expect(wrong).toEqual({ ok: false, reason: "wrongStation" });
    expect(ticketState(exited.ticket, at + 31 * 60_000)).toBe("exited");
    expect(exited.ticket.exit).toEqual({ station: "NTA", at: at + 30 * 60_000 });
    expect(enterGate(exited.ticket, "PTK", at + 40 * 60_000)).toEqual({
      ok: false,
      reason: "used",
    });
  });

  it("过了有效期（次日 04:00）就「已失效」，闸机拒绝；已经出站的票仍算「已出站」", () => {
    const ticket = newTicket();
    const late = ticket.validUntil + 60_000;

    expect(ticketState(ticket, late)).toBe("expired");
    expect(enterGate(ticket, "PTK", late)).toEqual({ ok: false, reason: "expired" });

    const entered = enterGate(ticket, "PTK", dayStart + 12 * hour);
    const exited = entered.ok && exitGate(entered.ticket, "NTA", dayStart + 13 * hour);
    expect(exited && exited.ok && ticketState(exited.ticket, late)).toBe("exited");
  });

  it("凌晨 0–4 点的车次仍属前一运营日：当天 04:00 失效，不是再过一天", () => {
    const ticket = issueTicket({
      route: { from: station("PTK"), to: station("NTA") },
      journey: { departure: 30 * 60, arrival: 50 * 60, lineCodes: ["MT"] },
      now: dayStart + 10 * 60_000,
      dayStart,
      timeZone: "Asia/Shanghai",
    });

    expect(ticket.validUntil).toBe(dayStart + 4 * hour);
    expect(ticket.id).toMatch(/^TL-1030-/);
  });

  it("提前买明天的票：日期与有效期都按行程那一天算", () => {
    const ticket = issueTicket({
      route: { from: station("PTK"), to: station("NTA") },
      journey: { departure: 9 * 3600, arrival: 10 * 3600, lineCodes: ["MT"] },
      now: dayStart - 2 * hour,
      dayStart,
      timeZone: "Asia/Shanghai",
    });

    expect(ticket.id).toMatch(/^TL-1031-/);
    expect(ticket.validUntil).toBe(dayStart + 28 * hour);
  });

  it("有效期按当地时钟的 04:00 算：夏令时结束那一夜也一样", () => {
    // 伦敦 2026-10-24 0 点（夏令时，UTC+1）；次日凌晨 2 点拨回 1 点，04:00 是 UTC 04:00。
    const londonDay = Date.UTC(2026, 9, 23, 23);
    const ticket = issueTicket({
      route: { from: station("PTK"), to: station("NTA") },
      journey: { departure: 12 * 3600, arrival: 13 * 3600, lineCodes: ["MT"] },
      now: londonDay + 12 * hour,
      dayStart: londonDay,
      timeZone: "Europe/London",
    });

    expect(ticket.validUntil).toBe(Date.UTC(2026, 9, 25, 4));
  });

  it("二维码内容每 30 秒换一次（动态码，截图过一会儿就失效），带票号、状态与时间窗", () => {
    const ticket = newTicket();
    const t = dayStart + 12 * hour; // 正好在一个 30 秒时间窗的开头

    const a = qrPayload(ticket, t + 1_000);
    const b = qrPayload(ticket, t + 29_000);
    const c = qrPayload(ticket, t + 31_000);

    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect(a).toContain(ticket.id);
    expect(a).toContain("unused");
    expect(a).toContain(String(Math.floor(t / 30_000)));
  });
});
