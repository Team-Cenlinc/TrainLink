import type { LineShape } from "./lineShape.ts";
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
  /** 这一站分岔时，另一支的下一站（站名）。 */
  forks: string[];
}

/**
 * 本站前后各 range 站，用于下拉后的线路条。站序来自 GTFS（本站所在的那一支，见 lib/lineShape.ts）；
 * 车站在线路端点时只取一侧；分岔站标出另一支的下一站（forks）。
 * 没有站序数据时返回空数组，界面就不显示线路条。
 */
export function neighbourStops(
  catalog: RailCatalog | undefined,
  shape: LineShape | undefined,
  station: RailStation,
  line: RailStationLine,
  range = 2,
): StripStop[] {
  const order = shape?.main;
  const index = order?.indexOf(station.code) ?? -1;
  if (!shape || !order || index < 0) return [];
  const find = (code: string) => findStation(catalog, station.serverId, line.operatorCode, code);
  return order.slice(Math.max(0, index - range), index + range + 1).map((code) => {
    const stop = find(code);
    return {
      code,
      name: stop?.name ?? code,
      current: code === station.code,
      transfers: (stop?.lines ?? []).filter((l) => l.lineCode !== line.lineCode),
      forks: shape.branches
        .filter((b) => b.junction === code)
        .flatMap((b) => b.stops.slice(0, 1))
        .map((next) => find(next)?.name ?? next),
    };
  });
}

/** 线路上每站相邻的站：主干与各支线（并回的绕行段也接回主干）。先列站序在前的一侧。 */
function adjacentStops(shape: LineShape): Map<string, string[]> {
  const adjacent = new Map<string, string[]>();
  const link = (chain: string[]) => {
    chain.slice(1).forEach((code, i) => {
      const previous = chain[i]!;
      adjacent.set(previous, [...(adjacent.get(previous) ?? []), code]);
      adjacent.set(code, [...(adjacent.get(code) ?? []), previous]);
    });
  };
  link(shape.main);
  for (const b of shape.branches) {
    link([b.junction, ...b.stops, ...(b.rejoin !== undefined ? [b.rejoin] : [])]);
  }
  return adjacent;
}

/**
 * 沿线最近的可换乘车站（本站不能换乘时用于提示）。从本站沿线路一站一站往外找，过分岔站也接着找；
 * 距离是实际要坐几站。
 */
export function nearestTransfer(
  catalog: RailCatalog | undefined,
  shape: LineShape | undefined,
  station: RailStation,
  line: RailStationLine,
): { stop: RailStation; lines: RailStationLine[]; distance: number } | undefined {
  if (!shape) return undefined;
  const adjacent = adjacentStops(shape);
  if (!adjacent.has(station.code)) return undefined;
  const seen = new Set([station.code]);
  let ring = [station.code];
  for (let distance = 1; ring.length > 0; distance++) {
    const next: string[] = [];
    for (const from of ring) {
      for (const code of adjacent.get(from) ?? []) {
        if (seen.has(code)) continue;
        seen.add(code);
        next.push(code);
        const stop = findStation(catalog, station.serverId, line.operatorCode, code);
        const lines = (stop?.lines ?? []).filter((l) => l.lineCode !== line.lineCode);
        if (stop && lines.length) return { stop, lines, distance };
      }
    }
    ring = next;
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
