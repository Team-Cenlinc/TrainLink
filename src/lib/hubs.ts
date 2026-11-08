import { stationKey } from "./gtfs.ts";
import type { HomeStation } from "./homeStation.ts";
import type { RailCatalog, RailStation, RailStationGroup, RailStationLine } from "./railApi.ts";
import { findStation, servingLines } from "./station.ts";

/**
 * 枢纽：catalog 车站组里 transferType 为 IN_STATION 的成员合成一个站，乘客把它看作一个车站
 * （例如海侧约翰 = SURC:JBS + PUAT:JBS）。OUT_OF_STATION 的成员仍是各自的车站，只互相链接。
 * 本站、收藏、链接与车票都存一个成员站，读出来时再用这里换算成枢纽。
 */
export interface Hub {
  /** 枢纽里的成员站（含查的那一站），按车站组成员的顺序；不在 IN_STATION 组里时只有它自己。 */
  members: RailStation[];
  /** 显示名：成员站名都相同时用站名，否则用车站组名。 */
  name: string;
  /** 车站组名（例如「海侧约翰枢纽」）；不是枢纽时没有。 */
  groupName?: string;
  /** API 给了时：两家之间站内换乘要走几秒（成员的 walkSeconds 取最大的）。 */
  walkSeconds?: number;
}

/** 成员的 walkSeconds 取最大的；都没有时没有。 */
function groupWalkSeconds(groups: RailStationGroup[]): number | undefined {
  const walks = groups.flatMap((g) => inStation(g).flatMap((m) => m.walkSeconds ?? []));
  return walks.length > 0 ? Math.max(...walks) : undefined;
}

const inStation = (group: RailStationGroup) =>
  group.members.filter((m) => m.transferType === "IN_STATION");

/** 某服务器上合成枢纽的车站组（至少两个 IN_STATION 成员）。 */
function hubGroups(catalog: RailCatalog | undefined, serverId: string): RailStationGroup[] {
  return (catalog?.stationGroups ?? []).filter(
    (g) => g.serverId === serverId && inStation(g).length > 1,
  );
}

/** 车站所属运营方的代码。 */
export function operatorCodeOf(catalog: RailCatalog | undefined, station: RailStation): string {
  return catalog?.operators.find((o) => o.id === station.operatorId)?.code ?? "";
}

/** 车站 key（运营方:站码）。 */
export function keyOf(catalog: RailCatalog | undefined, station: RailStation): string {
  return stationKey(operatorCodeOf(catalog, station), station.code);
}

/** 一个车站所在的枢纽。 */
export function hubOf(catalog: RailCatalog | undefined, station: RailStation): Hub {
  const groups = hubGroups(catalog, station.serverId).filter((g) =>
    inStation(g).some((m) => m.stationId === station.id),
  );
  const ids = [...new Set(groups.flatMap((g) => inStation(g).map((m) => m.stationId)))];
  const members = ids
    .map((id) => (id === station.id ? station : catalog?.stations.find((s) => s.id === id)))
    .filter((s): s is RailStation => Boolean(s));
  if (members.length < 2) return { members: [station], name: station.name };
  const sameName = members.every((m) => m.name === station.name);
  const groupName = groups[0]!.name;
  const walkSeconds = groupWalkSeconds(groups);
  return {
    members,
    name: sameName ? station.name : groupName,
    groupName,
    ...(walkSeconds !== undefined && { walkSeconds }),
  };
}

/**
 * 几个成员站（通常是枢纽里显示的那几家）停靠的全部线路，按成员顺序，同一条线只列一次。
 * 标题、选站器、侧边栏与行程页的线路色牌都用它。
 */
export function hubLines(members: RailStation[]): RailStationLine[] {
  return members
    .flatMap(servingLines)
    .filter((l, i, all) => all.findIndex((x) => x.lineId === l.lineId) === i);
}

/** 按本站（或任何存下来的车站）找枢纽；catalog 里找不到这个站时没有。 */
export function hubOfRef(catalog: RailCatalog | undefined, ref: HomeStation): Hub | undefined {
  const station = findStation(catalog, ref.serverId, ref.operatorCode, ref.stationCode);
  return station && hubOf(catalog, station);
}

/** 枢纽全部成员站的 key（行程规划的起终点）；catalog 里找不到时只有这一站。 */
export function hubKeys(catalog: RailCatalog | undefined, ref: HomeStation): string[] {
  const hub = hubOfRef(catalog, ref);
  return hub
    ? hub.members.map((m) => keyOf(catalog, m))
    : [stationKey(ref.operatorCode, ref.stationCode)];
}

/** 两个车站是不是同一个枢纽（包括同一个站）。 */
export function sameHub(catalog: RailCatalog | undefined, a: HomeStation, b: HomeStation): boolean {
  if (a.serverId !== b.serverId) return false;
  const keys = hubKeys(catalog, a);
  return keys.includes(stationKey(b.operatorCode, b.stationCode));
}

/** 枢纽里有几家运营方：不止一家时，站台要标出是哪一家的。 */
export function hubOperators(catalog: RailCatalog | undefined, hub: Hub): string[] {
  return [...new Set(hub.members.map((m) => operatorCodeOf(catalog, m)))];
}

/**
 * 行程规划要加的枢纽站内换乘：每个枢纽的成员站 key，以及 API 给了时的换乘秒数
 * （成员的 walkSeconds 取最大的）。不按设置里隐藏的运营方过滤：隐藏只影响显示。
 */
export function hubTransfers(
  catalog: RailCatalog | undefined,
  serverId: string,
): { stations: string[]; seconds?: number }[] {
  return hubGroups(catalog, serverId).map((g) => {
    const seconds = groupWalkSeconds([g]);
    return {
      stations: inStation(g).map((m) => stationKey(m.operatorCode, m.stationCode)),
      ...(seconds !== undefined && { seconds }),
    };
  });
}
