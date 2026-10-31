import type { CSSProperties, PointerEvent, Ref } from "react";
import { motion, useTransform, type MotionValue } from "motion/react";
import InfoIcon from "@material-symbols/svg-400/outlined/info.svg?react";
import OpenIcon from "@material-symbols/svg-400/outlined/arrow_outward.svg?react";
import SearchIcon from "@material-symbols/svg-400/outlined/search.svg?react";
import StarIcon from "@material-symbols/svg-400/outlined/star.svg?react";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import { fallbackLineColor, onLineColor } from "@/lib/lineColor.ts";
import type { RailStation, RailStationLine } from "@/lib/railApi.ts";
import type { StripStop } from "@/lib/station.ts";
import type { PanelOpener } from "./BoardPage.tsx";
import { useShown } from "./useShown.ts";
import styles from "./StationHeader.module.css";

interface StationHeaderProps {
  station?: RailStation;
  stationCode: string;
  /** 本站停靠的线路。 */
  lines: RailStationLine[];
  /** 下拉后显示的前后站；没有站序数据时为空。 */
  strip: StripStop[];
  mapUrl?: string;
  /** 服务器当前时刻，例如 22:18；和发车行的时刻同一时区。 */
  clock: string;
  onInfo: PanelOpener;
  /** 「常用车站」：打开车站选择。 */
  onPickStation: PanelOpener;
  /** 右上角🔍：打开车站选择并聚焦搜索框。 */
  onSearchStation: PanelOpener;
  /** 在色块上按下即开始拖动面板（下拉）。 */
  onDragStart: (event: PointerEvent) => void;
  /** 面板从默认推上的进度（0–1）。 */
  up: MotionValue<number>;
  /** 面板从默认下拉的进度（0–1）。 */
  down: MotionValue<number>;
  titleRef: Ref<HTMLDivElement>;
  contextRef: Ref<HTMLDivElement>;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * 把进度的一段 [start, end] 换成「出现」：不透明度 0 → 1，同时从下方 rise 像素升到原位。
 * 几个元素用错开的区间，就得到跟着手指走的依次出现，而不是按时间播放的 stagger。
 */
function useReveal(progress: MotionValue<number>, start: number, end: number, rise = 12) {
  const opacity = useTransform(progress, (p) => clamp01((p - start) / (end - start)));
  const y = useTransform(opacity, (o) => (1 - o) * rise);
  return { opacity, y };
}

/**
 * 本站标题：整块线路色，铺满面板后方。默认只露出站名与编号（学 TrainTime，不加线路装饰）；
 * 面板下拉后，色块里平时隐藏的「车站周围」信息才露出来：线路名、前后站、换乘与地图。
 * 单线车站用线路色；换乘站用中性深色加等分色带，避免某条线的色牌在同色底上看不见。
 *
 * 动效（全部由面板位置驱动）：
 * - 推上：大站名比面板慢地向上漂移、略微缩小，并在前 60% 行程内淡出；工具栏在前 45% 内淡出，
 *   把位置让给收起的标题栏（见 CompactBar），两者不同时出现。
 * - 下拉：线路名、线路条、地图行按顺序依次升起出现。
 */
export function StationHeader({
  station,
  stationCode,
  lines,
  strip,
  mapUrl,
  clock,
  onInfo,
  onPickStation,
  onSearchStation,
  onDragStart,
  up,
  down,
  titleRef,
  contextRef,
}: StationHeaderProps) {
  const isTransfer = lines.length > 1;
  const color = isTransfer ? fallbackLineColor : (lines[0]?.color ?? fallbackLineColor);
  const style = { "--line": color, "--on-line": onLineColor(color) } as CSSProperties;
  const position = station?.position;

  const titleOpacity = useTransform(up, (p) => 1 - clamp01(p / 0.6));
  const titleY = useTransform(up, (p) => p * -28);
  const titleScale = useTransform(up, (p) => 1 - 0.06 * p);
  const toolbarOpacity = useTransform(up, (p) => 1 - clamp01(p / 0.45));
  const toolbarY = useTransform(up, (p) => p * -8);
  const lineNameReveal = useReveal(down, 0.05, 0.55);
  const stripReveal = useReveal(down, 0.2, 0.75);
  const mapReveal = useReveal(down, 0.35, 0.9);
  // 完全淡出后的工具栏与地图链接设为 inert（见 useShown），与上面的不透明度区间一致。
  const toolbarShown = useShown(up, (p) => p < 0.45);
  const mapShown = useShown(down, (p) => p > 0.35);

  return (
    <header className={styles.header} style={style} onPointerDown={onDragStart}>
      <motion.div
        className={styles.toolbar}
        style={{ opacity: toolbarOpacity, y: toolbarY }}
        inert={!toolbarShown}
      >
        <button type="button" className={styles.textButton} onClick={onPickStation}>
          <StarIcon aria-hidden />
          常用车站
        </button>
        <span className={styles.actions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="搜索车站"
            onClick={onSearchStation}
          >
            <SearchIcon aria-hidden />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="车站信息"
            onClick={onInfo}
          >
            <InfoIcon aria-hidden />
          </button>
        </span>
      </motion.div>

      <motion.div
        ref={titleRef}
        className={styles.title}
        style={{ opacity: titleOpacity, y: titleY, scale: titleScale }}
      >
        <h1 className={styles.name}>
          <StationName name={station?.name ?? stationCode} />
        </h1>
        <div className={styles.tagsRow}>
          <StationTags lines={lines} stationCode={stationCode} />
          <span className={styles.clock}>
            现在 <span className="num">{clock}</span>
          </span>
        </div>
        {isTransfer && (
          <div className={styles.band} aria-hidden>
            {lines.map((line) => (
              <span key={line.lineId} style={{ background: line.color ?? fallbackLineColor }} />
            ))}
          </div>
        )}
      </motion.div>

      <div ref={contextRef} className={styles.context}>
        {lines.length === 1 && lines[0] && (
          <motion.p className={styles.lineName} style={lineNameReveal}>
            {lines[0].lineName}
          </motion.p>
        )}
        {strip.length > 0 && (
          <motion.div style={stripReveal}>
            <LineStrip stops={strip} />
          </motion.div>
        )}
        {mapUrl && position && (
          <motion.div className={styles.mapRow} style={mapReveal} inert={!mapShown}>
            <a className={styles.mapButton} href={mapUrl} target="_blank" rel="noreferrer">
              在地图中查看
              <OpenIcon aria-hidden />
            </a>
            <span className={`${styles.coords} num`}>
              {station?.world} · X {Math.round(position.x)} Z {Math.round(position.z)}
            </span>
          </motion.div>
        )}
      </div>
    </header>
  );
}

/** 站名只在「·」处换行。 */
export function StationName({ name }: { name: string }) {
  return name.split("·").map((part, i) => (
    <span key={i}>
      {i > 0 && (
        <>
          ·<wbr />
        </>
      )}
      {part}
    </span>
  ));
}

/** 编号标签：白底，线路码用线路色，站码用深色。 */
export function StationTags({
  lines,
  stationCode,
  className,
}: {
  lines: RailStationLine[];
  stationCode: string;
  className?: string;
}) {
  return (
    <div className={`${styles.tags} ${className ?? ""}`}>
      {lines.map((line) => (
        <span
          key={line.lineId}
          className={styles.tag}
          style={{ "--tag-line": line.color ?? fallbackLineColor } as CSSProperties}
        >
          <span className={styles.tagLine}>{line.lineCode}</span>
          {stationCode}
        </span>
      ))}
    </div>
  );
}

/**
 * 前后站线路条：白色线身加深色描边（官网 404 换乘指引的线路几何），本站圆点加大。
 * 站序来自 GTFS；本站在线路端点时只画一侧。
 */
export function LineStrip({ stops }: { stops: StripStop[] }) {
  return (
    <ol className={styles.strip} aria-label="前后车站">
      {stops.map((stop) => (
        <li key={stop.code} className={stop.current ? styles.current : undefined}>
          <span className={styles.dot} aria-hidden />
          <span className={styles.stopName}>{stop.name}</span>
          {stop.transfers.length > 0 && (
            <span className={styles.transfers} aria-label="可换乘">
              {stop.transfers.map((line) => (
                <ServiceBadge
                  key={line.lineId}
                  lineCode={line.lineCode}
                  lineColor={line.color}
                  size="s"
                />
              ))}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
