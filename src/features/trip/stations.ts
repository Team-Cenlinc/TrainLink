import { parseStationKey } from "@/lib/gtfs.ts";
import type { HomeStation } from "@/lib/homeStation.ts";
import { hubLines, hubOfRef, hubOperators } from "@/lib/hubs.ts";
import type { RailCatalog, RailOperator, RailStationLine } from "@/lib/railApi.ts";

/**
 * 行程页面里显示一个车站：站名与停靠的线路（色牌用）。枢纽显示枢纽名与各成员站的全部线路
 * （行程从哪个成员站出发都行）。找不到时退回站码。
 */
export function stationInfo(
  catalog: RailCatalog | undefined,
  ref: HomeStation,
): { name: string; lines: RailStationLine[] } {
  const hub = hubOfRef(catalog, ref);
  return {
    name: hub?.name ?? ref.stationCode,
    lines: hub ? hubLines(hub.members) : [],
  };
}

/**
 * 线路 → 线路（名称、颜色）。line 是「运营方:线路码」，或线路码加 operatorCode：线路码只在运营方内唯一。
 * 只有线路码（旧车票）时按线路码找第一条。
 */
export function lineOf(
  catalog: RailCatalog | undefined,
  serverId: string,
  line: string,
  operatorCode?: string,
) {
  const at = line.indexOf(":");
  const code = at < 0 ? line : line.slice(at + 1);
  const operator = at < 0 ? operatorCode : line.slice(0, at);
  const operatorId =
    operator && catalog?.operators.find((o) => o.serverId === serverId && o.code === operator)?.id;
  return catalog?.lines.find(
    (l) =>
      l.serverId === serverId && l.code === code && (!operatorId || l.operatorId === operatorId),
  );
}

/** 运营方在界面上的叫法：有简称用简称，否则用全名。 */
export function operatorLabel(operator: Pick<RailOperator, "name" | "shortName">): string {
  return operator.shortName ?? operator.name;
}

/**
 * 上车站台属于哪家运营方（叫法）：只有上车站在有多家运营方的枢纽里才有。
 * 站台号只在运营方内唯一，枢纽里两家都有站台 1，要说清楚是哪一家的；普通站不用。
 */
export function platformOperator(
  catalog: RailCatalog | undefined,
  serverId: string,
  leg: { from: string; platform?: string },
): string | undefined {
  if (!leg.platform) return undefined;
  const { operatorCode, stationCode } = parseStationKey(leg.from);
  const hub = hubOfRef(catalog, { serverId, operatorCode, stationCode });
  if (!hub || hubOperators(catalog, hub).length < 2) return undefined;
  const operator = catalog?.operators.find(
    (o) => o.serverId === serverId && o.code === operatorCode,
  );
  return operator && operatorLabel(operator);
}

/** 上车站台的一句话：「1 号站台」，枢纽里是「蒲塘桥都会区交通 1 号站台」；没有站台号时没有。 */
export function platformText(
  catalog: RailCatalog | undefined,
  serverId: string,
  leg: { from: string; platform?: string },
): string | undefined {
  if (!leg.platform) return undefined;
  const operator = platformOperator(catalog, serverId, leg);
  return `${operator ? `${operator} ` : ""}${leg.platform} 号站台`;
}
