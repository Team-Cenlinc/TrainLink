import { describe, expect, it } from "vitest";
import { journeyHref } from "./tripStore.ts";

const station = (code: string) => ({
  serverId: "survival",
  operatorCode: "SURC",
  stationCode: code,
});

describe("journeyHref", () => {
  it("乘坐指南与乘车 GO 的网址：起终点、日期、出发时刻与第一段车次", () => {
    const href = journeyHref(
      "go",
      { from: station("PTK"), to: station("NTA") },
      { date: "2026-10-31", departure: 44280, tripId: "survival:SURC:MT:T:M1" },
    );
    const url = new URL(href, "https://example.test");
    expect(url.pathname).toBe("/trip/go");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      from: "SURC:PTK",
      to: "SURC:NTA",
      date: "2026-10-31",
      dep: "44280",
      trip: "survival:SURC:MT:T:M1",
    });
  });

  it("没有乘车段（只步行）时不带车次", () => {
    const href = journeyHref(
      "guide",
      { from: station("PTK"), to: station("NTA") },
      { date: "2026-10-31", departure: 100 },
    );
    expect(new URL(href, "https://example.test").searchParams.has("trip")).toBe(false);
  });
});
