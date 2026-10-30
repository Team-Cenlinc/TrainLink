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
/** 列车卡片高度（标题 36 + 正文 28），用于避让同一侧的相邻卡片。 */
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

/**
 * 单线列车位置：一条粗线路（线身 + 两侧深色描边），车站为白底深环圆点，本站为深色实心。
 * 往第一站方向的列车卡片在左，往最后一站方向的在右，由引线连到线路上的位置。
 * 列车卡片保留列车图标，一眼就能认出是车。
 */
export function LineView({ layout, lineColor }: { layout: LineLayout; lineColor?: string }) {
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

        {placed.map(({ train, top, anchor }) => (
          <TrainCard key={train.name} train={train} top={top} anchor={anchor} />
        ))}
      </div>
    </section>
  );
}

/**
 * 同一侧卡片的避让：重叠的卡片合成一组，整组以各车真实位置的平均值为中心排开，
 * 并限制在线路图范围内（不会挤到最后一站下面）。引线仍指向每列车的真实位置。
 */
function placeColumn(trains: LineTrain[], height: number) {
  type Item = { train: LineTrain; anchor: number };
  type Group = { items: Item[]; top: number };
  const size = (g: Group) => g.items.length * cardHeight + (g.items.length - 1) * cardGap;
  const clamp = (g: Group) => {
    g.top = Math.min(Math.max(g.top, 0), height - size(g));
  };

  const groups: Group[] = [];
  for (const train of [...trains].sort((a, b) => a.slot - b.slot)) {
    const anchor = train.slot * rowHeight + rowHeight / 2;
    const group: Group = { items: [{ train, anchor }], top: anchor - cardHeight / 2 };
    clamp(group);
    groups.push(group);
    // 与上一组重叠就合并，并重新居中；合并后可能又碰到更上一组，所以循环。
    while (groups.length > 1) {
      const b = groups[groups.length - 1]!;
      const a = groups[groups.length - 2]!;
      if (a.top + size(a) + cardGap <= b.top) break;
      a.items.push(...b.items);
      const mean = a.items.reduce((sum, item) => sum + item.anchor, 0) / a.items.length;
      a.top = mean - size(a) / 2;
      clamp(a);
      groups.pop();
    }
  }

  return groups.flatMap((g) =>
    g.items.map((item, i) => ({ ...item, top: g.top + i * (cardHeight + cardGap) })),
  );
}

function TrainCard({ train, top, anchor }: { train: LineTrain; top: number; anchor: number }) {
  const side = train.direction === "toStart" ? styles.left : styles.right;
  const label = `${train.serviceType}，往${train.headsign ?? "未知终点"}${
    train.delayMinutes ? `，晚点 ${train.delayMinutes} 分` : ""
  }`;
  return (
    <div className={`${styles.train} ${side}`} style={{ top }} aria-label={label}>
      <span className={styles.leader} style={{ top: anchor - top - 1.5 }} aria-hidden />
      {train.delayMinutes !== undefined && (
        <span className={styles.delay}>+{train.delayMinutes} 分</span>
      )}
      <span className={styles.cardHead}>
        <span className={styles.cardType}>{train.serviceType}</span>
        <span className={styles.cardDest}>{train.headsign ?? "—"}</span>
      </span>
      <span className={styles.cardBody}>
        {train.cars !== undefined && <span className={styles.cars}>{train.cars} 节</span>}
        {train.crowding !== undefined && <Crowding level={train.crowding} />}
        <TrainIcon aria-hidden />
      </span>
    </div>
  );
}

/** 拥挤度 4 格；颜色按 PIDS 状态色：1–2 级绿，3 级琥珀，4 级红，并配文字给读屏。 */
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
