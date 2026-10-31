import { describe, expect, it } from "vitest";
import { parseTickets } from "./ticketStore.ts";

const good = {
  id: "TL-1031-1218-7Q2K",
  from: { serverId: "survival", operatorCode: "SURC", stationCode: "PTK" },
  to: { serverId: "survival", operatorCode: "SURC", stationCode: "NTA" },
  departure: 44280,
  arrival: 45360,
  lineCodes: ["MT"],
  issuedAt: 1,
  validUntil: 2,
};

describe("票夹读取", () => {
  it("缺字段或字段类型不对的票跳过，其余照常读出", () => {
    const text = JSON.stringify([
      good,
      { id: "TL-坏的" },
      { ...good, id: "TL-2", lineCodes: "MT" },
      { ...good, id: "TL-3", entry: { station: "PTK" } },
      null,
    ]);

    expect(parseTickets(text).map((t) => t.id)).toEqual([good.id]);
  });

  it("不是 JSON 或不是数组时返回空票夹", () => {
    expect(parseTickets("{")).toEqual([]);
    expect(parseTickets('{"id":1}')).toEqual([]);
    expect(parseTickets(null)).toEqual([]);
  });
});
