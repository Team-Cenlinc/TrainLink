import { useEffect, useRef, type CSSProperties } from "react";
import ArrowDownIcon from "@material-symbols/svg-400/outlined/arrow_downward.svg?react";
import ArrowUpIcon from "@material-symbols/svg-400/outlined/arrow_upward.svg?react";
import TrainIcon from "@material-symbols/svg-400/outlined/train.svg?react";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import { fallbackLineColor, onLineColor } from "@/lib/lineColor.ts";
import type { LineLayout, LineTrain } from "./linePositions.ts";
import styles from "./LineView.module.css";

/** 每站一行的高度；列车位置按行换算成纵坐标。 */
const rowHeight = 72;
/** 列车卡片高度（标题 30 + 正文 30），用于避让同一侧的相邻卡片。 */
const cardHeight = 60;
const cardGap = 6;

interface LineViewProps {
  layout: LineLayout;
  lineColor?: string;
  /** 列车位置的更新时刻，例如 22:18。 */
  updated?: string;
}

/**
 * 单线列车位置：一条粗线路（线身 + 两侧深色描边），车站为白底深环圆点，本站为深色实心。
 * 往第一站方向的列车卡片在左，往最后一站方向的在右，由引线连到线路上的位置。
 * 列车卡片保留列车图标，一眼就能认出是车。
 */
export function LineView({ layout, lineColor, updated }: LineViewProps) {
  const color = lineColor ?? fallbackLineColor;
  const style = {
    "--line": color,
    "--on-line": onLineColor(color),
    "--row": `${rowHeight}px`,
  } as CSSProperties;
  const currentRef = useRef<HTMLLIElement>(null);
  const { stops, trains } = layout;
  const first = stops[0];
  const last = stops[stops.length - 1];

  // 打开时把本站滚到视野中间。
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "center" });
  }, [stops.length]);

  const placed = [
    ...placeColumn(trains.filter((t) => t.direction === "toStart")),
    ...placeColumn(trains.filter((t) => t.direction === "toEnd")),
  ];

  return (
    <section className={styles.view} style={style} aria-label="列车位置">
      <div className={styles.directions}>
        <span className={styles.direction}>
          <ArrowUpIcon aria-hidden />往{first?.name}
        </span>
        <span className={styles.direction}>
          <ArrowDownIcon aria-hidden />往{last?.name}
        </span>
      </div>
      {updated && (
        <p className={styles.updated}>
          <span className="num">{updated}</span> 更新 · 每 5 秒刷新
        </p>
      )}

      <div className={styles.diagram} style={{ height: stops.length * rowHeight }}>
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

        {placed.map(({ train, top }) => (
          <TrainCard key={train.name} train={train} top={top} />
        ))}
      </div>
    </section>
  );
}

/**
 * 同一侧的卡片按位置从上到下排，若与上一张重叠就往下推。
 * 引线仍指向列车的真实位置，所以推开后也能看出车在哪。
 */
function placeColumn(trains: LineTrain[]) {
  let bottom = -Infinity;
  return [...trains]
    .sort((a, b) => a.slot - b.slot)
    .map((train) => {
      const anchor = train.slot * rowHeight + rowHeight / 2;
      const top = Math.max(anchor - cardHeight / 2, bottom + cardGap);
      bottom = top + cardHeight;
      return { train, top, anchor };
    });
}

function TrainCard({ train, top }: { train: LineTrain; top: number }) {
  const anchor = train.slot * rowHeight + rowHeight / 2;
  const side = train.direction === "toStart" ? styles.left : styles.right;
  return (
    <div
      className={`${styles.train} ${side}`}
      style={{ top }}
      aria-label={`${train.serviceType}，往${train.headsign ?? "未知终点"}${train.delayMinutes ? `，晚点 ${train.delayMinutes} 分` : ""}`}
    >
      <span className={styles.leader} style={{ top: anchor - top - 1.5 }} aria-hidden />
      {train.delayMinutes && <span className={styles.delay}>+{train.delayMinutes} 分</span>}
      <span className={styles.cardHead}>
        <span className={styles.cardTitle}>
          {train.serviceType}·{train.headsign ?? "—"}
        </span>
        {train.cars && <span className={styles.cars}>{train.cars} 节</span>}
      </span>
      <span className={styles.cardBody}>
        {train.crowding && <Crowding level={train.crowding} />}
        <TrainIcon aria-hidden />
      </span>
    </div>
  );
}

/** 拥挤度 4 个点；颜色按 PIDS 状态色：1–2 级绿，3 级琥珀，4 级红，并配文字给读屏。 */
function Crowding({ level }: { level: number }) {
  const tone = level <= 2 ? styles.ok : level === 3 ? styles.caution : styles.error;
  const label = ["宽松", "较空", "较多", "拥挤"][level - 1];
  return (
    <span className={`${styles.crowding} ${tone}`} role="img" aria-label={`拥挤度：${label}`}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={i <= level ? styles.filled : undefined} />
      ))}
    </span>
  );
}
