import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import ArrowDownIcon from "@material-symbols/svg-400/outlined/arrow_downward.svg?react";
import ArrowUpIcon from "@material-symbols/svg-400/outlined/arrow_upward.svg?react";
import ForkIcon from "@material-symbols/svg-400/outlined/fork_right.svg?react";
import TrainIcon from "@material-symbols/svg-400/outlined/train.svg?react";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import { fallbackLineColor, onLineColor } from "@/lib/lineColor.ts";
import type { RailStationLine } from "@/lib/railApi.ts";
import { useSettings } from "@/lib/settings.ts";
import type { CarLoad, LineLayout, LineStop, LineTrain } from "./linePositions.ts";
import { severeDelayMinutes } from "./departures.ts";
import { cardHeight, placeColumn, rowHeight } from "./placeColumn.ts";
import styles from "./LineView.module.css";
import { lineKey } from "@/lib/gtfs.ts";

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
 * 有支线时往终点方向分往几处（last 有几个），几个终点叠成几行。
 */
export function LineDirections({
  first,
  last,
  updated,
  lineColor,
}: {
  first?: string;
  last: string[];
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
      <span
        className={`${styles.direction} ${styles.right} ${last.length > 1 ? styles.stacked : ""}`}
      >
        <ArrowDownIcon aria-hidden />
        <span className={styles.ends}>
          {last.map((name, i) => (
            <span key={i}>
              {i === 0 && "往"}
              {name}
            </span>
          ))}
        </span>
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
  /** 选中的线路：运营方:线路码（枢纽里两家可能有同码的线路）。 */
  value?: string;
  onChange: (line: string) => void;
}) {
  if (lines.length < 2) return null;
  return (
    <div className={styles.switcher} role="group" aria-label="选择线路">
      {lines.map((line) => {
        const key = lineKey(line.operatorCode, line.lineCode);
        return (
          <button
            key={line.lineId}
            type="button"
            className={`${styles.lineChip} ${key === value ? styles.selectedChip : ""}`}
            aria-pressed={key === value}
            onClick={() => onChange(key)}
          >
            <ServiceBadge lineCode={line.lineCode} lineColor={line.color} size="s" />
            {line.lineName}
          </button>
        );
      })}
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
  const { stops, trains, branches } = layout;
  // 主干上的分岔站：从这一站分出的各支线开往哪里（并回主干的绕行段写「经」第一站）。
  const forks = new Map<string, string[]>();
  for (const branch of branches) {
    const label = branch.rejoin
      ? `经${branch.stops[0]?.name ?? ""}`
      : `往${branch.stops.at(-1)?.name ?? ""}`;
    forks.set(branch.junction.code, [...(forks.get(branch.junction.code) ?? []), label]);
  }

  // 打开时、换乘站上切换线路时，把本站滚到视野中间；只是列车位置刷新时不动。
  const stopsKey = [...stops, ...branches.flatMap((b) => b.stops)].map((s) => s.code).join(",");
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "center" });
  }, [stopsKey]);

  return (
    <section className={styles.view} style={lineStyle(lineColor)} aria-label="列车位置">
      <Diagram
        stops={stops}
        trains={trains}
        forks={forks}
        currentRef={currentRef}
        onSelect={onSelectTrain}
      />
      {/* 支线：主干下面另起一段，从分岔站画起（分岔站那一行淡一些，只标出从哪里分出）。 */}
      {branches.map((branch) => (
        <section
          key={`${branch.junction.code}-${branch.stops[0]?.code}`}
          className={styles.branch}
          aria-label={`${branch.junction.name}分出的支线`}
        >
          <p className={styles.branchHead}>
            {branch.junction.name} 分出 ·{" "}
            {branch.rejoin ? `在${branch.rejoin.name}并回` : `往${branch.stops.at(-1)?.name}`}
          </p>
          <Diagram
            stops={[branch.junction, ...branch.stops, ...(branch.rejoin ? [branch.rejoin] : [])]}
            trains={branch.trains}
            junction
            rejoin={!!branch.rejoin}
            currentRef={currentRef}
            onSelect={onSelectTrain}
          />
        </section>
      ))}
    </section>
  );
}

/**
 * 一段线路图：车站一行一行排下来，线身从第一站中心画到最后一站中心，两侧放列车卡片。
 * @param junction 第一行是分岔站（支线那一段）：只标出从哪里分出，本站与换乘不再重复。
 * @param rejoin 最后一行是并回主干的站（绕行段），画法同分岔站。
 * @param forks 主干上的分岔站（站码 → 各支线的说明「往…」「经…」）：站名下标出分岔图标与说明。
 */
function Diagram({
  stops,
  trains,
  junction,
  rejoin,
  forks,
  currentRef,
  onSelect,
}: {
  stops: LineStop[];
  trains: LineTrain[];
  junction?: boolean;
  rejoin?: boolean;
  forks?: Map<string, string[]>;
  currentRef: RefObject<HTMLLIElement | null>;
  onSelect?: TrainSelect;
}) {
  const { showStationCodes } = useSettings();
  const height = stops.length * rowHeight;
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
    <div className={styles.diagram} style={{ height }}>
      <ol className={styles.stops}>
        {stops.map((stop, i) => {
          // 分岔站、并回站在主干上已经画过，这里只标出位置。
          const isJunction = (junction && i === 0) || (rejoin && i === stops.length - 1);
          const current = stop.current && !isJunction;
          return (
            <li
              key={stop.code}
              ref={current ? currentRef : undefined}
              className={`${styles.stop} ${current ? styles.current : ""} ${
                isJunction ? styles.junction : ""
              }`}
              aria-current={current ? "location" : undefined}
            >
              <span className={styles.stopName}>{stop.name}</span>
              {!isJunction && (
                <span className={styles.stopMeta}>
                  {showStationCodes && <span className={styles.code}>{stop.code}</span>}
                  {current && <span className={styles.here}>本站</span>}
                  {forks?.has(stop.code) && (
                    <span className={styles.fork} title="在这一站分出支线">
                      <ForkIcon aria-hidden />
                      <span>{forks.get(stop.code)!.join("、")}</span>
                    </span>
                  )}
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
              <span className={styles.dot} aria-hidden />
            </li>
          );
        })}
      </ol>
      <span className={styles.line} aria-hidden />

      {placed.map(({ trains, top, anchor }) => (
        <TrainCard
          key={trains[0]!.name}
          trains={trains}
          top={top}
          anchor={anchor}
          onSelect={onSelect}
        />
      ))}
    </div>
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
