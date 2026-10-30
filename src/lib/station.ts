import { lineKey, type LineOrders } from "./gtfs.ts";
import type { RailCatalog, RailStation, RailStationLine } from "./railApi.ts";

/**
 * 车站相关的查找与派生信息，供标题、下拉的「车站周围」和车站信息面板共用。
 * 站码只在同一服务器、同一运营商内唯一，查找时都要带上运营商。
 */

export function findStation(
  catalog: RailCatalog | undefined,
  serverId: string,
  operatorCode: string,
  stationCode: string,
): RailStation | undefined {
  const operatorId = catalog?.operators.find(
    (o) => o.serverId === serverId && o.code === operatorCode,
  )?.id;
  return catalog?.stations.find(
    (s) => s.serverId === serverId && s.operatorId === operatorId && s.code === stationCode,
  );
}

/** 本站停靠的线路（不含经车站组换乘的线路）。 */
export function servingLines(station: RailStation): RailStationLine[] {
  return station.lines.filter((l) => !l.viaStationCode);
}

/** 经车站组换乘的线路，例如河滨道经浦汇换乘海岛线、浦蓝线。 */
export function transferLines(station: RailStation): RailStationLine[] {
  return station.lines.filter((l) => l.viaStationCode);
}

/** 线路条上的一站。 */
export interface StripStop {
  code: string;
  name: string;
  current: boolean;
  /** 在这一站可以换乘的其他线路。 */
  transfers: RailStationLine[];
}

/**
 * 本站前后各 range 站，用于下拉后的线路条。站序来自 GTFS；车站在线路端点时只取一侧。
 * 没有站序数据时返回空数组，界面就不显示线路条。
 */
export function neighbourStops(
  catalog: RailCatalog | undefined,
  lineOrders: LineOrders | undefined,
  station: RailStation,
  line: RailStationLine,
  range = 2,
): StripStop[] {
  const order = lineOrders?.get(lineKey(line.operatorCode, line.lineCode));
  const index = order?.indexOf(station.code) ?? -1;
  if (!order || index < 0) return [];
  return order.slice(Math.max(0, index - range), index + range + 1).map((code) => {
    const stop = findStation(catalog, station.serverId, line.operatorCode, code);
    return {
      code,
      name: stop?.name ?? code,
      current: code === station.code,
      transfers: (stop?.lines ?? []).filter((l) => l.lineCode !== line.lineCode),
    };
  });
}

/** 沿线最近的可换乘车站（本站不能换乘时用于提示）。 */
export function nearestTransfer(
  catalog: RailCatalog | undefined,
  lineOrders: LineOrders | undefined,
  station: RailStation,
  line: RailStationLine,
): { stop: RailStation; lines: RailStationLine[]; distance: number } | undefined {
  const order = lineOrders?.get(lineKey(line.operatorCode, line.lineCode));
  const index = order?.indexOf(station.code) ?? -1;
  if (!order || index < 0) return undefined;
  for (let distance = 1; distance < order.length; distance++) {
    for (const i of [index - distance, index + distance]) {
      const code = order[i];
      if (!code) continue;
      const stop = findStation(catalog, station.serverId, line.operatorCode, code);
      const lines = (stop?.lines ?? []).filter((l) => l.lineCode !== line.lineCode);
      if (stop && lines.length) return { stop, lines, distance };
    }
  }
  return undefined;
}

/** BlueMap 地图（Fetarute 各服务器的网页地图）中定位到车站的链接。 */
export function blueMapUrl(station: RailStation): string | undefined {
  if (!station.world || !station.position) return undefined;
  const { x, y, z } = station.position;
  const at = [x, y, z].map((v) => Math.round(v)).join(":");
  return `https://map.${station.serverId}.fetarute.org/#${station.world}:${at}:150:0:0:0:0:perspective`;
}
