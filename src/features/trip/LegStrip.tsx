import type { CSSProperties } from "react";
import WalkIcon from "@material-symbols/svg-400/outlined/directions_walk.svg?react";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import { fallbackLineColor } from "@/lib/lineColor.ts";
import type { RailCatalog } from "@/lib/railApi.ts";
import type { Leg } from "./planner.ts";
import { lineOf } from "./stations.ts";
import styles from "./LegStrip.module.css";

/**
 * 行程的线路条（v06 行程方案）：每段乘车一截线路色（线身 + 两侧深色描边，同线路图），
 * 长度按乘车时间；开头一个小号色牌。步行是一截虚线加步行图标。直通车在一截里按线路分色。
 */
export function LegStrip({
  legs,
  catalog,
  serverId,
}: {
  legs: Leg[];
  catalog: RailCatalog | undefined;
  serverId: string;
}) {
  return (
    <span className={styles.strip} aria-hidden>
      {legs.map((leg, i) => {
        const grow = Math.max(60, leg.arrival - leg.departure);
        if (leg.kind === "walk") {
          return (
            <span key={i} className={styles.walk} style={{ flexGrow: grow }}>
              <WalkIcon />
            </span>
          );
        }
        const lines = leg.lineCodes.map((code) => lineOf(catalog, serverId, code));
        return (
          <span key={i} className={styles.ride} style={{ flexGrow: grow }}>
            <ServiceBadge lineCode={leg.lineCode} lineColor={lines[0]?.color} size="s" />
            <span className={styles.bar}>
              {lines.map((line, j) => (
                <span
                  key={j}
                  style={{ "--line": line?.color ?? fallbackLineColor } as CSSProperties}
                />
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
