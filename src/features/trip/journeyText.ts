import { parseStationKey } from "@/lib/gtfs.ts";
import type { RailCatalog } from "@/lib/railApi.ts";
import { hubOf } from "@/lib/hubs.ts";
import { findStation } from "@/lib/station.ts";
import type { Leg } from "./planner.ts";

/** 行程方案与乘坐指南共用的几句文字。 */

/** 换乘次数：乘车段数减一（直通车算一段）。 */
export function transferCount(legs: Leg[]): number {
  return Math.max(0, legs.filter((l) => l.kind === "ride").length - 1);
}

/**
 * 车站 key（运营方:站码）→ 站名；枢纽的成员站显示枢纽名（同行程方案页的 stationInfo）。
 * 不带运营方的旧数据只有站码，按站码找第一个（找不到时显示站码）。
 */
export function stationName(catalog: RailCatalog | undefined, serverId: string, key: string) {
  const { operatorCode, stationCode } = parseStationKey(key);
  const station = operatorCode
    ? findStation(catalog, serverId, operatorCode, stationCode)
    : catalog?.stations.find((st) => st.serverId === serverId && st.code === stationCode);
  return station ? hubOf(catalog, station).name : stationCode;
}

/**
 * 每次换乘一句：同站换乘写「新笛矢·壑湖换乘」，站外换乘写「步行 3 分至河滨道」，
 * 枢纽里换另一家运营方写「蒲塘桥港站内换乘」。
 */
export function changeNotes(
  legs: Leg[],
  catalog: RailCatalog | undefined,
  serverId: string,
): string[] {
  const name = (code: string) => stationName(catalog, serverId, code);
  const notes: string[] = [];
  legs.forEach((leg, i) => {
    const next = legs[i + 1];
    if (leg.kind === "walk" && leg.inStation) {
      notes.push(`${name(leg.to)}站内换乘`);
    } else if (leg.kind === "walk") {
      notes.push(`步行 ${Math.ceil(leg.seconds / 60)} 分至${name(leg.to)}`);
    } else if (next?.kind === "ride") {
      notes.push(`${name(leg.to)}换乘`);
    }
  });
  return notes;
}

/** 运营日内的秒数差 → 分钟（向上取整，至少 1）。 */
export const minutesBetween = (from: number, to: number) =>
  Math.max(1, Math.ceil((to - from) / 60));
