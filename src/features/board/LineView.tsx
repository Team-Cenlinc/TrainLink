import { useEffect, useRef, type CSSProperties } from "react";
import ArrowDownIcon from "@material-symbols/svg-400/outlined/arrow_downward.svg?react";
import ArrowUpIcon from "@material-symbols/svg-400/outlined/arrow_upward.svg?react";
import TrainIcon from "@material-symbols/svg-400/outlined/train.svg?react";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import { fallbackLineColor, onLineColor } from "@/lib/lineColor.ts";
import type { RailStationLine } from "@/lib/railApi.ts";
import type { CarLoad, LineLayout, LineTrain } from "./linePositions.ts";
import styles from "./LineView.module.css";

/** 每站一行的高度；列车位置按行换算成纵坐标。 */
const rowHeight = 72;
/** 一列车在卡片里占的高度（标题 36 + 正文 28）；合并卡片按车数叠加。用于避让同一侧的相邻卡片。 */
const cardHeight = 64;
const cardGap = 6;

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
  const { stops, trains } = layout;
  const height = stops.length * rowHeight;

  // 打开时把本站滚到视野中间。
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "center" });
  }, [stops.length]);

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
                <span className={styles.code}>{stop.code}</span>
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

/**
 * 同一侧卡片的摆放：
 * 1. 同一侧、同一位置（同停一站或同在一个区间）的几列车合成一张卡片，每列车一段，都留在那一站旁边；
 * 2. 仍然重叠的卡片合成一组，整组以各卡片真实位置的平均值为中心排开，
 *    并限制在线路图范围内（不会挤到最后一站下面）。位置三角仍指向每张卡片的真实位置。
 */
function placeColumn(trains: LineTrain[], height: number) {
  type Item = { trains: LineTrain[]; anchor: number };
  type Group = { items: Item[]; top: number };
  const itemHeight = (item: Item) => item.trains.length * cardHeight;
  const size = (g: Group) =>
    g.items.reduce((sum, item) => sum + itemHeight(item), 0) + (g.items.length - 1) * cardGap;
  const clamp = (g: Group) => {
    g.top = Math.min(Math.max(g.top, 0), height - size(g));
  };

  const items: Item[] = [];
  for (const train of [...trains].sort((a, b) => a.slot - b.slot)) {
    const previous = items.at(-1);
    if (previous && previous.trains[0]!.slot === train.slot) previous.trains.push(train);
    else items.push({ trains: [train], anchor: train.slot * rowHeight + rowHeight / 2 });
  }

  const groups: Group[] = [];
  for (const item of items) {
    const group: Group = { items: [item], top: item.anchor - itemHeight(item) / 2 };
    clamp(group);
    groups.push(group);
    // 与上一组重叠就合并，并重新居中；合并后可能又碰到更上一组，所以循环。
    while (groups.length > 1) {
      const b = groups[groups.length - 1]!;
      const a = groups[groups.length - 2]!;
      if (a.top + size(a) + cardGap <= b.top) break;
      a.items.push(...b.items);
      const mean = a.items.reduce((sum, i) => sum + i.anchor, 0) / a.items.length;
      a.top = mean - size(a) / 2;
      clamp(a);
      groups.pop();
    }
  }

  return groups.flatMap((g) => {
    let top = g.top;
    return g.items.map((item) => {
      const placed = { ...item, top };
      top += itemHeight(item) + cardGap;
      return placed;
    });
  });
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
 * 卡片里的一列车：种别与终点、车厢拥挤度。晚点标签一般浮在卡片上方；
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
  const delay = train.delayMinutes !== undefined && (
    <span className={delayInline ? styles.delayInline : styles.delay}>
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
