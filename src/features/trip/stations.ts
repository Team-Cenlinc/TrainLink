import type { HomeStation } from "@/lib/homeStation.ts";
import type { RailCatalog, RailStationLine } from "@/lib/railApi.ts";
import { findStation, servingLines } from "@/lib/station.ts";

/** 行程页面里显示一个车站：站名与停靠的线路（色牌用）。找不到时退回站码。 */
export function stationInfo(
  catalog: RailCatalog | undefined,
  ref: HomeStation,
): { name: string; lines: RailStationLine[] } {
  const station = findStation(catalog, ref.serverId, ref.operatorCode, ref.stationCode);
  return { name: station?.name ?? ref.stationCode, lines: station ? servingLines(station) : [] };
}

/** 线路码 → 线路（名称、颜色）。 */
export function lineOf(catalog: RailCatalog | undefined, serverId: string, lineCode: string) {
  return catalog?.lines.find((l) => l.serverId === serverId && l.code === lineCode);
}
