import type { GateRefusal, TicketState } from "./ticket.ts";

/** 票的状态文字与闸机拒绝的原因，票夹与车票页共用。 */
export const stateLabel: Record<TicketState, string> = {
  unused: "未入站",
  entered: "已入站",
  exited: "已出站",
  expired: "已失效",
};

export const refusalText: Record<GateRefusal, string> = {
  wrongStation: "这张票不能在这一站使用",
  alreadyEntered: "已经进站了",
  notEntered: "还没有进站",
  used: "这张票已经用过了",
  expired: "这张票已经过了有效期",
};
