import type { CSSProperties, Ref } from "react";
import { motion, useTransform, type MotionValue } from "motion/react";
import InfoIcon from "@material-symbols/svg-400/outlined/info.svg?react";
import SearchIcon from "@material-symbols/svg-400/outlined/search.svg?react";
import { fallbackLineColor, onLineColor } from "@/lib/lineColor.ts";
import type { RailStationLine } from "@/lib/railApi.ts";
import type { PanelOpener } from "./BoardPage.tsx";
import { StationTags } from "./StationHeader.tsx";
import { useShown } from "./useShown.ts";
import styles from "./CompactBar.module.css";

interface CompactBarProps {
  name: string;
  stationCode: string;
  lines: RailStationLine[];
  /** 面板从默认推上的进度（0–1）。 */
  up: MotionValue<number>;
  onSearch: () => void;
  onInfo: PanelOpener;
  barRef: Ref<HTMLDivElement>;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * 面板推上后的收起标题栏：一行「站名 + 编号」，右侧搜索与车站信息。
 * 搜索框此时已滚出视野，所以搜索按钮只在这里出现。
 *
 * 动效：只在推上行程的后 45% 出现（大站名在前 60% 已淡出），并从下方 8 px 升到原位，
 * 两个标题依次交接，不会叠在一起。背景透明：后面的色块本来就是同一颜色。
 */
export function CompactBar({
  name,
  stationCode,
  lines,
  up,
  onSearch,
  onInfo,
  barRef,
}: CompactBarProps) {
  const color = lines.length === 1 ? (lines[0]?.color ?? fallbackLineColor) : fallbackLineColor;
  const style = { "--line": color, "--on-line": onLineColor(color) } as CSSProperties;
  const opacity = useTransform(up, (p) => clamp01((p - 0.55) / 0.45));
  const y = useTransform(opacity, (o) => (1 - o) * 8);
  // 没完全出现时不拦截点按，点按会落到下面的色块工具栏上；也不能用 Tab 键聚焦、不让读屏软件读到。
  const pointerEvents = useTransform<number, string>(up, (p) => (p > 0.9 ? "auto" : "none"));
  const shown = useShown(up, (p) => p > 0.9);

  return (
    <motion.div ref={barRef} className={styles.bar} style={{ ...style, pointerEvents }}>
      <motion.div className={styles.content} style={{ opacity, y }} inert={!shown}>
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
    </motion.div>
  );
}
