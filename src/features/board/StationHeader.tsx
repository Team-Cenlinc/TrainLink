import type { CSSProperties, PointerEvent, Ref } from "react";
import { motion, type MotionValue } from "motion/react";
import InfoIcon from "@material-symbols/svg-400/outlined/info.svg?react";
import OpenIcon from "@material-symbols/svg-400/outlined/arrow_outward.svg?react";
import StarIcon from "@material-symbols/svg-400/outlined/star.svg?react";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import { fallbackLineColor, onLineColor } from "@/lib/lineColor.ts";
import type { RailStation, RailStationLine } from "@/lib/railApi.ts";
import type { StripStop } from "@/lib/station.ts";
import styles from "./StationHeader.module.css";

interface StationHeaderProps {
  station?: RailStation;
  stationCode: string;
  /** 本站停靠的线路。 */
  lines: RailStationLine[];
  /** 下拉后显示的前后站；没有站序数据时为空。 */
  strip: StripStop[];
  mapUrl?: string;
  onInfo: () => void;
  /** 在色块上按下即开始拖动面板（下拉）。 */
  onDragStart: (event: PointerEvent) => void;
  /** 下拉内容的不透明度，随面板位置变化。 */
  contextOpacity: MotionValue<number>;
  titleRef: Ref<HTMLDivElement>;
  contextRef: Ref<HTMLDivElement>;
}

/**
 * 本站标题：整块线路色，铺满面板后方。默认只露出站名与编号（学 TrainTime，不加线路装饰）；
 * 面板下拉后，色块里平时隐藏的「车站周围」信息才露出来：线路名、前后站、换乘与地图。
 * 单线车站用线路色；换乘站用中性深色加等分色带，避免某条线的色牌在同色底上看不见。
 */
export function StationHeader({
  station,
  stationCode,
  lines,
  strip,
  mapUrl,
  onInfo,
  onDragStart,
  contextOpacity,
  titleRef,
  contextRef,
}: StationHeaderProps) {
  const isTransfer = lines.length > 1;
  const color = isTransfer ? fallbackLineColor : (lines[0]?.color ?? fallbackLineColor);
  const style = { "--line": color, "--on-line": onLineColor(color) } as CSSProperties;
  const position = station?.position;

  return (
    <header className={styles.header} style={style} onPointerDown={onDragStart}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.textButton}>
          <StarIcon aria-hidden />
          常用车站
        </button>
        <button type="button" className={styles.iconButton} aria-label="车站信息" onClick={onInfo}>
          <InfoIcon aria-hidden />
        </button>
      </div>

      <div ref={titleRef}>
        <h1 className={styles.name}>
          <StationName name={station?.name ?? stationCode} />
        </h1>
        <StationTags lines={lines} stationCode={stationCode} />
        {isTransfer && (
          <div className={styles.band} aria-hidden>
            {lines.map((line) => (
              <span key={line.lineId} style={{ background: line.color ?? fallbackLineColor }} />
            ))}
          </div>
        )}
      </div>

      <motion.div ref={contextRef} className={styles.context} style={{ opacity: contextOpacity }}>
        {lines.length === 1 && lines[0] && <p className={styles.lineName}>{lines[0].lineName}</p>}
        {strip.length > 0 && <LineStrip stops={strip} />}
        {mapUrl && position && (
          <div className={styles.mapRow}>
            <a className={styles.mapButton} href={mapUrl} target="_blank" rel="noreferrer">
              在地图中查看
              <OpenIcon aria-hidden />
            </a>
            <span className={`${styles.coords} num`}>
              {station?.world} · X {Math.round(position.x)} Z {Math.round(position.z)}
            </span>
          </div>
        )}
      </motion.div>
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
function LineStrip({ stops }: { stops: StripStop[] }) {
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
