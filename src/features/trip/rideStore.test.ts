import { describe, expect, it } from "vitest";
import { parseActiveRide, rideKey, rideReminderPrefix, shouldResume } from "./rideStore.ts";

const ride = {
  href: "/trip/go?from=SURC%3APTK&to=SURC%3ANTA&date=2026-11-01&dep=25311&trip=T1",
  arrival: 1_500,
  until: 2_000,
};

describe("正在进行的乘车 GO", () => {
  it("读出保存的乘车；坏数据当作没有", () => {
    expect(parseActiveRide(JSON.stringify(ride), 1_000)).toEqual(ride);
    expect(parseActiveRide("{", 1_000)).toBeUndefined();
    expect(parseActiveRide(JSON.stringify({ href: 1, until: 2 }), 1_000)).toBeUndefined();
    // 之前一版没有 arrival：按结束时刻当作到达。
    expect(parseActiveRide(JSON.stringify({ href: ride.href, until: 2_000 }), 1_000)).toEqual({
      href: ride.href,
      until: 2_000,
      arrival: 2_000,
    });
    expect(parseActiveRide(null, 1_000)).toBeUndefined();
  });

  it("过了结束时刻（预计到达后一段时间）就不算在乘车了：重开 App 不会再回到很久以前的 GO", () => {
    expect(parseActiveRide(JSON.stringify(ride), 2_001)).toBeUndefined();
  });

  it("同一趟乘车：起终点、日期、出发时刻与车次都相同，参数顺序不同也算", () => {
    expect(rideKey(ride.href)).toBe(
      rideKey("/trip/go?trip=T1&dep=25311&date=2026-11-01&to=SURC%3ANTA&from=SURC%3APTK"),
    );
    expect(rideKey(ride.href)).not.toBe(rideKey(ride.href.replace("dep=25311", "dep=26031")));
  });

  it("重开 App 时只有还没到站才自动回到 GO（到了就留在看板）", () => {
    expect(shouldResume(ride, 1_000)).toBe(true);
    expect(shouldResume(ride, 1_600)).toBe(false);
    expect(shouldResume(undefined, 1_000)).toBe(false);
  });

  it("下车提醒按这趟乘车分组：结束或改乘时一起取消", () => {
    expect(rideReminderPrefix(ride.href)).toBe(`go-${rideKey(ride.href)}`);
  });
});
