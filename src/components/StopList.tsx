import type { CSSProperties, ReactNode } from "react";
import styles from "./StopList.module.css";

/**
 * 停靠站列表，列车详情与乘车 GO 共用：竖着一条线路，每站一行（站点圆、站名与标签、右侧时刻）。
 * 列车走过的线段为灰色；列车停在站上时站点圆填深色、里面一个白色小三角（dwell），
 * 行驶中在两站之间插一行 ▼（TrainRow）。折叠的几站画成虚线一段（GapRow）。
 * 线路色用 --line（整条），跨线直通时每行用 lineIn / lineOut 分开上下两半。
 */
export function StopList({
  label,
  style,
  children,
}: {
  label?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <ol className={styles.stops} style={style} aria-label={label}>
      {children}
    </ol>
  );
}

/** 一行的线段颜色：上半段是驶入这一站的线路，下半段是驶出的（不给就用 --line）。 */
function lineStyle(lineIn?: string, lineOut?: string) {
  return { "--line-in": lineIn, "--line-out": lineOut ?? lineIn } as CSSProperties;
}

export function StopRow({
  name,
  tags,
  time,
  passed,
  emphasis,
  dwell,
  first,
  last,
  lineIn,
  lineOut,
  current,
}: {
  name: ReactNode;
  /** 跟在站名后面的标签与说明（StopTag、StopStatus）。 */
  tags?: ReactNode;
  time?: ReactNode;
  /** 列车已经开过这一站：线段、站点圆和文字都变灰。 */
  passed?: boolean;
  /** here：粗环白芯、站名加大（本站、下车站）；end：实心圆（终点）。 */
  emphasis?: "here" | "end";
  /** 列车正停在这一站。 */
  dwell?: boolean;
  first?: boolean;
  last?: boolean;
  lineIn?: string;
  lineOut?: string;
  /** 读屏：列车此刻在这一站，或这是下一步要到的站。 */
  current?: "location" | "step";
}) {
  const classes = [
    styles.stop,
    passed && styles.passed,
    emphasis && styles[emphasis],
    dwell && `${styles.dwell} ${styles.reached}`,
    first && styles.first,
    last && styles.last,
  ];
  return (
    <li
      className={classes.filter(Boolean).join(" ")}
      style={lineStyle(lineIn, lineOut)}
      aria-current={current}
    >
      <span className={styles.rail} aria-hidden>
        <span className={styles.dot} />
        {dwell && <span className={styles.train} />}
      </span>
      <span className={styles.stopName}>
        {name}
        {tags}
      </span>
      <span className={`${styles.stopTime} num`}>{time}</span>
    </li>
  );
}

/** 行驶中的列车：插在刚开过的站与前方的站之间，▼ 压在灰色与线路色两段的交界上。 */
export function TrainRow({ label, line }: { label: ReactNode; line?: string }) {
  return (
    <li className={`${styles.stop} ${styles.trainRow} ${styles.reached}`} style={lineStyle(line)}>
      <span className={styles.rail} aria-hidden>
        <span className={styles.train} />
      </span>
      <span className={styles.status}>{label}</span>
    </li>
  );
}

/** 折叠的几站：线路画成虚线一段，旁边一个展开按钮。列车已经开过这几站时是灰色。 */
export function GapRow({
  label,
  onExpand,
  passed,
  line,
}: {
  label: ReactNode;
  onExpand: () => void;
  passed?: boolean;
  line?: string;
}) {
  return (
    <li
      className={`${styles.stop} ${styles.gap} ${passed ? styles.passed : ""}`}
      style={lineStyle(line)}
    >
      <span className={styles.rail} aria-hidden />
      <button type="button" className={styles.expand} onClick={onExpand}>
        {label}
      </button>
    </li>
  );
}

/** 站名后的标签：深色小块（本站、终点、上车）；exit 是出口色（下车）。 */
export function StopTag({ children, tone }: { children: ReactNode; tone?: "exit" }) {
  return <span className={`${styles.tag} ${tone === "exit" ? styles.exit : ""}`}>{children}</span>;
}

/** 站名后的灰色说明（列车在此、直通…）。 */
export function StopStatus({ children }: { children: ReactNode }) {
  return <span className={styles.status}>{children}</span>;
}
