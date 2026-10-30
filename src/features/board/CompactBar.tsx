import type { CSSProperties, Ref } from "react";
import { motion, type MotionValue } from "motion/react";
import InfoIcon from "@material-symbols/svg-400/outlined/info.svg?react";
import SearchIcon from "@material-symbols/svg-400/outlined/search.svg?react";
import { fallbackLineColor, onLineColor } from "@/lib/lineColor.ts";
import type { RailStationLine } from "@/lib/railApi.ts";
import { StationTags } from "./StationHeader.tsx";
import styles from "./CompactBar.module.css";

interface CompactBarProps {
  name: string;
  stationCode: string;
  lines: RailStationLine[];
  /** 面板推上时为 1，其余为 0；随面板位置连续变化。 */
  opacity: MotionValue<number>;
  /** 不可见时不拦截点按。 */
  pointerEvents: MotionValue<string>;
  onSearch: () => void;
  onInfo: () => void;
  barRef: Ref<HTMLDivElement>;
}

/**
 * 面板推上后的收起标题栏：一行「站名 + 编号」，右侧搜索与车站信息。
 * 搜索框此时已滚出视野，所以搜索按钮只在这里出现。
 */
export function CompactBar({
  name,
  stationCode,
  lines,
  opacity,
  pointerEvents,
  onSearch,
  onInfo,
  barRef,
}: CompactBarProps) {
  const color = lines.length === 1 ? (lines[0]?.color ?? fallbackLineColor) : fallbackLineColor;
  const style = { "--line": color, "--on-line": onLineColor(color), opacity, pointerEvents };
  return (
    <motion.div ref={barRef} className={styles.bar} style={style as unknown as CSSProperties}>
      <span className={styles.title}>{name}</span>
      <StationTags lines={lines} stationCode={stationCode} className={styles.tags} />
      <span className={styles.spacer} />
      <button
        type="button"
        className={styles.iconButton}
        aria-label="搜索去哪里"
        onClick={onSearch}
      >
        <SearchIcon aria-hidden />
      </button>
      <button type="button" className={styles.iconButton} aria-label="车站信息" onClick={onInfo}>
        <InfoIcon aria-hidden />
      </button>
    </motion.div>
  );
}
