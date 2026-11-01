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
      { ...good, id: "TL-4", ride: { date: 1 } },
      null,
    ]);

    expect(parseTickets(text).map((t) => t.id)).toEqual([good.id]);
    // 旧版本按班次出的票（有出发、到达时刻、没有 ride）照常读出。
    expect(parseTickets(JSON.stringify([good]))).toEqual([good]);
    // 区间票没有出发、到达时刻。
    const { departure: _d, arrival: _a, ...section } = good;
    const withRide = {
      ...section,
      id: "TL-5",
      ride: { date: "2026-10-31", departure: 1, tripId: "T1" },
    };
    expect(parseTickets(JSON.stringify([withRide]))).toEqual([withRide]);
    // 区间票之前的一版：ride 里没有出发时刻（出发时刻在票上）。
    const earlier = { ...good, id: "TL-6", ride: { date: "2026-10-31", tripId: "T1" } };
    expect(parseTickets(JSON.stringify([earlier]))).toEqual([earlier]);
  });

  it("不是 JSON 或不是数组时返回空票夹", () => {
    expect(parseTickets("{")).toEqual([]);
    expect(parseTickets('{"id":1}')).toEqual([]);
    expect(parseTickets(null)).toEqual([]);
  });
});
