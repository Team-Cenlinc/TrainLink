import { operatorLabel } from "@/features/trip/stations.ts";
import type { RailCatalog } from "@/lib/railApi.ts";
import type { GateRefusal, Ticket, TicketState } from "./ticket.ts";

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

/**
 * 票头写哪家运营方（像真实车票印发售的铁路公司）：坐的线路属于几家就写几家，跨两家时是联运票。
 * 旧版本的票线路只有线路码，按起点站所属的运营方；线路目录还没读到时写 TrainLink。
 */
export function ticketIssuer(
  catalog: RailCatalog | undefined,
  ticket: Ticket,
): { name: string; through: boolean } {
  const fromLines = ticket.lineCodes.flatMap((line) =>
    line.includes(":") ? [line.split(":")[0]!] : [],
  );
  const codes = [...new Set(fromLines.length ? fromLines : [ticket.from.operatorCode])];
  const operators = codes.map((code) =>
    catalog?.operators.find((o) => o.serverId === ticket.from.serverId && o.code === code),
  );
  if (!catalog || operators.some((o) => !o))
    return { name: "TrainLink", through: codes.length > 1 };
  return {
    name: operators.map((o) => operatorLabel(o!)).join(" · "),
    through: codes.length > 1,
  };
}
