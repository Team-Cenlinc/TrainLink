import { describe, expect, it } from "vitest";
import type { TripRealtime } from "@/lib/realtime.ts";
import { applyRealtime } from "./live.ts";
import { planJourneys } from "./planner.ts";
import { at, gtfsFiles } from "./testTimetable.ts";
import { buildTimetable } from "./timetable.ts";

/** 运营日 0 点（毫秒）；实时数据是绝对时刻，减去它就是运营日内的秒数。 */
const dayStart = Date.UTC(2026, 9, 31) - 8 * 3600_000;
const ms = (t: string) => dayStart + at(t) * 1000;

function realtime(
  tripId: string,
  stops: Record<string, { arrival?: string; departure?: string }>,
): [string, TripRealtime] {
  return [
    tripId,
    {
      cancelled: false,
      stops: new Map(
        Object.entries(stops).map(([code, t]) => [
          code,
          {
            arrival: t.arrival ? ms(t.arrival) : undefined,
            departure: t.departure ? ms(t.departure) : undefined,
          },
        ]),
      ),
    },
  ];
}

const timetable = buildTimetable(
  gtfsFiles([
    {
      id: "M1",
      line: "MT",
      headsign: "X",
      stops: [
        ["P1", "08:00"],
        ["X", "08:10"],
      ],
    },
    {
      id: "W1",
      line: "WS",
      headsign: "Q",
      stops: [
        ["X", "08:13"],
        ["Q", "08:22"],
      ],
    },
  ]),
);
const [journey] = planJourneys(timetable, { from: "P1", to: "Q", departAfter: at("07:55") });

describe("applyRealtime", () => {
  it("用实时数据替换各段的出发、到达，给出整个行程的预计到达与晚点分钟数", () => {
    const live = applyRealtime(
      journey!,
      new Map([
        realtime("survival:SURC:WS:T:W1", { X: { departure: "08:15" }, Q: { arrival: "08:24" } }),
      ]),
      dayStart,
    );

    expect(live.legs.map((l) => [l.live.departure, l.live.arrival])).toEqual([
      [at("08:00"), at("08:10")],
      [at("08:15"), at("08:24")],
    ]);
    expect(live.live).toEqual({ departure: at("08:00"), arrival: at("08:24") });
    expect(live.delayMinutes).toBe(2);
    expect(live.riskyChange).toBe(false);
  });

  it("前一段晚到、留给换乘的时间不足 2 分钟时，标出换乘可能赶不上", () => {
    const live = applyRealtime(
      journey!,
      new Map([realtime("survival:SURC:MT:T:M1", { X: { arrival: "08:12" } })]),
      dayStart,
    );

    expect(live.riskyChange).toBe(true);
  });

  it("直通车：到达站在后一段车次里，也能取到实时到达", () => {
    const through = buildTimetable(
      gtfsFiles([
        {
          id: "D1",
          line: "MT",
          headsign: "Q",
          stops: [
            ["P1", "08:00"],
            ["X", "08:10"],
          ],
        },
        {
          id: "D1",
          leg: 2,
          line: "WS",
          owner: "MT",
          headsign: "Q",
          stops: [
            ["X", "08:10"],
            ["Q", "08:20"],
          ],
        },
      ]),
    );
    const [ride] = planJourneys(through, { from: "P1", to: "Q", departAfter: at("07:55") });

    const live = applyRealtime(
      ride!,
      new Map([realtime("survival:SURC:MT:T:D1~2", { Q: { arrival: "08:23" } })]),
      dayStart,
    );

    expect(live.live.arrival).toBe(at("08:23"));
  });
});
