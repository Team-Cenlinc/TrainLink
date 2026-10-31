import { useEffect, useRef, type CSSProperties } from "react";
import ArrowDownIcon from "@material-symbols/svg-400/outlined/arrow_downward.svg?react";
import ArrowUpIcon from "@material-symbols/svg-400/outlined/arrow_upward.svg?react";
import TrainIcon from "@material-symbols/svg-400/outlined/train.svg?react";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import { fallbackLineColor, onLineColor } from "@/lib/lineColor.ts";
import type { RailStationLine } from "@/lib/railApi.ts";
import { useSettings } from "@/lib/settings.ts";
import type { CarLoad, LineLayout, LineTrain } from "./linePositions.ts";
import { severeDelayMinutes } from "./departures.ts";
import { cardHeight, placeColumn, rowHeight } from "./placeColumn.ts";
import styles from "./LineView.module.css";

/** 线路色与行高写成 CSS 变量，方向标题与线路图共用同一套列位置。 */
function lineStyle(lineColor?: string): CSSProperties {
  const color = lineColor ?? fallbackLineColor;
  return {
    "--line": color,
    "--on-line": onLineColor(color),
    "--row": `${rowHeight}px`,
  } as CSSProperties;
}

/**
 * 方向标题：两个方向各在自己那一列的正上方，左侧空位写更新时刻。
 * 放在面板的吸顶区里（见 BoardPage），滚动线路图时一直可见。
 */
export function LineDirections({
  first,
  last,
  updated,
  lineColor,
}: {
  first?: string;
  last?: string;
  updated?: string;
  lineColor?: string;
}) {
  return (
    <div className={styles.directions} style={lineStyle(lineColor)}>
      {updated && (
        <span className={styles.updated}>
          <span className="num">{updated}</span> 更新
        </span>
      )}
      <span className={`${styles.direction} ${styles.left}`}>
        <ArrowUpIcon aria-hidden />往{first}
      </span>
      <span className={`${styles.direction} ${styles.right}`}>
        <ArrowDownIcon aria-hidden />往{last}
      </span>
    </div>
  );
}

/** 换乘站上切换显示哪条线路的列车位置；只有一条线路时不显示。 */
export function LineSwitcher({
  lines,
  value,
  onChange,
}: {
  lines: RailStationLine[];
  value?: string;
  onChange: (lineCode: string) => void;
}) {
  if (lines.length < 2) return null;
  return (
    <div className={styles.switcher} role="group" aria-label="选择线路">
      {lines.map((line) => (
        <button
          key={line.lineId}
          type="button"
          className={`${styles.lineChip} ${line.lineCode === value ? styles.selectedChip : ""}`}
          aria-pressed={line.lineCode === value}
          onClick={() => onChange(line.lineCode)}
        >
          <ServiceBadge lineCode={line.lineCode} lineColor={line.color} size="s" />
          {line.lineName}
        </button>
      ))}
    </div>
  );
}

/**
 * 单线列车位置：一条粗线路（线身 + 两侧深色描边），车站为白底深环圆点，本站为深色实心。
 * 每站一条白色站行，站与站之间露出底色，分隔清楚。
 * 往第一站方向的列车卡片在左，往最后一站方向的在右；卡片外侧有一个深色小三角，
 * 指向列车在线路上的真实位置。卡片保留列车图标，一眼就能认出是车。
 */
/** 点列车卡片：传回列车名与卡片位置（大屏的详情卡片据此定位）。 */
export type TrainSelect = (trainName: string, anchor: DOMRect) => void;

export function LineView({
  layout,
  lineColor,
  onSelectTrain,
}: {
  layout: LineLayout;
  lineColor?: string;
  onSelectTrain?: TrainSelect;
}) {
  const currentRef = useRef<HTMLLIElement>(null);
  const { showStationCodes } = useSettings();
  const { stops, trains } = layout;
  const height = stops.length * rowHeight;

  // 打开时、换乘站上切换线路时，把本站滚到视野中间；只是列车位置刷新时不动。
  const stopsKey = stops.map((s) => s.code).join(",");
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "center" });
  }, [stopsKey]);

  const placed = [
    ...placeColumn(
      trains.filter((t) => t.direction === "toStart"),
      height,
    ),
    ...placeColumn(
      trains.filter((t) => t.direction === "toEnd"),
      height,
    ),
  ];

  return (
    <section className={styles.view} style={lineStyle(lineColor)} aria-label="列车位置">
      <div className={styles.diagram} style={{ height }}>
        <ol className={styles.stops}>
          {stops.map((stop) => (
            <li
              key={stop.code}
              ref={stop.current ? currentRef : undefined}
              className={`${styles.stop} ${stop.current ? styles.current : ""}`}
              aria-current={stop.current ? "location" : undefined}
            >
              <span className={styles.stopName}>{stop.name}</span>
              <span className={styles.stopMeta}>
                {showStationCodes && <span className={styles.code}>{stop.code}</span>}
                {stop.current && <span className={styles.here}>本站</span>}
                {stop.transfers.map((line) => (
                  <ServiceBadge
                    key={line.lineId}
                    lineCode={line.lineCode}
                    lineColor={line.color}
                    size="s"
                  />
                ))}
              </span>
              <span className={styles.dot} aria-hidden />
            </li>
          ))}
        </ol>
        <span className={styles.line} aria-hidden />

        {placed.map(({ trains, top, anchor }) => (
          <TrainCard
            key={trains[0]!.name}
            trains={trains}
            top={top}
            anchor={anchor}
            onSelect={onSelectTrain}
          />
        ))}
      </div>
    </section>
  );
}

/** 位置三角离卡片上下边缘至少留这么多，卡片被挪开时也不会超出卡片范围。 */
const tailInset = 12;

/**
 * 列车卡片。同一位置的几列车合成一张卡片，每列车一段（标题 + 车厢），各自是一个按钮，点开那列车的详情；
 * 卡片外侧只有一个位置三角。
 */
function TrainCard({
  trains,
  top,
  anchor,
  onSelect,
}: {
  trains: LineTrain[];
  top: number;
  anchor: number;
  onSelect?: TrainSelect;
}) {
  const side = trains[0]!.direction === "toStart" ? styles.left : styles.right;
  const combined = trains.length > 1;
  return (
    <div
      className={`${styles.train} ${side} ${combined ? styles.combined : ""}`}
      style={{ top }}
      role={combined ? "group" : undefined}
      aria-label={combined ? `同一位置的 ${trains.length} 列车` : undefined}
    >
      {/* 位置三角：在卡片外侧，指向列车在线路上的真实位置。 */}
      <span
        className={styles.tail}
        style={{
          top: Math.min(Math.max(anchor - top, tailInset), trains.length * cardHeight - tailInset),
        }}
        aria-hidden
      />
      {trains.map((train, i) => (
        <TrainEntry key={train.name} train={train} delayInline={i > 0} onSelect={onSelect} />
      ))}
    </div>
  );
}

/**
 * 卡片里的一列车：种别与终点、车厢拥挤度。晚点标签一般浮在卡片上方（摆放时已为它留出空间，见 placeColumn）；
 * 合并卡片里第二列车起放进车厢那一行，代替列车图标，免得盖住上一段。
 */
function TrainEntry({
  train,
  delayInline,
  onSelect,
}: {
  train: LineTrain;
  delayInline: boolean;
  onSelect?: TrainSelect;
}) {
  const label = `${train.serviceType}，往${train.headsign ?? "未知终点"}${
    train.cars ? `，${train.cars.length} 节` : ""
  }${train.delayMinutes ? `，晚点 ${train.delayMinutes} 分` : ""}`;
  // 颜色与站牌、列车详情一致：不足 5 分琥珀，5 分及以上红。
  const delay = train.delayMinutes !== undefined && (
    <span
      className={`${delayInline ? styles.delayInline : styles.delay} ${
        train.delayMinutes >= severeDelayMinutes ? styles.severe : ""
      }`}
    >
      +{train.delayMinutes} 分
    </span>
  );
  return (
    <button
      type="button"
      className={styles.entry}
      aria-label={`${label}，查看列车详情`}
      onClick={(event) => onSelect?.(train.name, event.currentTarget.getBoundingClientRect())}
    >
      {!delayInline && delay}
      <span className={styles.cardHead}>
        <span className={styles.cardType}>{train.serviceType}</span>
        <span className={styles.cardDest}>{train.headsign ?? "—"}</span>
      </span>
      <span className={styles.cardBody}>
        {train.cars && <Cars loads={train.cars} />}
        {delayInline && delay ? delay : <TrainIcon aria-hidden />}
      </span>
    </button>
  );
}

const loadLabel: Record<CarLoad, string> = { low: "宽松", medium: "较多", high: "拥挤" };

/** 每节车厢一格，颜色按 PIDS 状态色（绿宽松、琥珀较多、红拥挤），格数就是编组节数。 */
function Cars({ loads }: { loads: CarLoad[] }) {
  return (
    <span
      className={styles.cars}
      role="img"
      aria-label={loads.map((load, i) => `${i + 1} 号车${loadLabel[load]}`).join("，")}
    >
      {loads.map((load, i) => (
        <span key={i} className={styles[load]} />
      ))}
    </span>
  );
}
