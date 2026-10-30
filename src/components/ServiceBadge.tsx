import type { CSSProperties } from "react";
import { fallbackLineColor, onLineColor } from "@/lib/lineColor.ts";
import styles from "./ServiceBadge.module.css";

interface ServiceBadgeProps {
  lineCode: string;
  lineColor?: string;
  /** 种别，例如「普通」「快速」；两个字上下叠放。省略时只显示线路码。 */
  serviceType?: string;
  size?: "m" | "s";
}

/**
 * 线路色牌，按 FTCA PIDS 的组合色牌：「线路码 | 种别」，种别两字上下叠放，中间一条竖线分隔。
 * 线路色通过 CSS 变量 --line / --on-line 传给样式，组件本身不写死任何颜色。
 */
export function ServiceBadge({ lineCode, lineColor, serviceType, size = "m" }: ServiceBadgeProps) {
  const color = lineColor ?? fallbackLineColor;
  const style = { "--line": color, "--on-line": onLineColor(color) } as CSSProperties;
  return (
    <span className={`${styles.badge} ${styles[size]}`} style={style}>
      <span className={styles.code}>{lineCode}</span>
      {serviceType && (
        <span className={styles.type} aria-label={serviceType}>
          {[...serviceType].map((char, i) => (
            <span key={i}>{char}</span>
          ))}
        </span>
      )}
    </span>
  );
}
