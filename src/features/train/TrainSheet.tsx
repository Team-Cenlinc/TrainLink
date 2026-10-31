import { Fragment, useState, type CSSProperties } from "react";
import CloseIcon from "@material-symbols/svg-400/outlined/close.svg?react";
import CollapseIcon from "@material-symbols/svg-400/outlined/keyboard_arrow_down.svg?react";
import { Overlay } from "@/components/Overlay.tsx";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import { fallbackLineColor } from "@/lib/lineColor.ts";
import { formatClock } from "@/lib/time.ts";
import type { RailStationLine } from "@/lib/railApi.ts";
import type { CarLoad } from "@/features/board/linePositions.ts";
import type { DetailStop, TrainDetail } from "./trainDetail.ts";
import styles from "./TrainSheet.module.css";

interface TrainSheetProps {
  open: boolean;
  onClose: () => void;
  variant: "sheet" | "popover";
  anchor?: DOMRect;
  detail?: TrainDetail;
  now: number;
  timeZone: string;
  /** 实时数据读取中（还没有各站时刻）。 */
  loading: boolean;
}

/** 列车详情：种别与终点、晚点与区间、到达本站、各节车厢拥挤度、接下来的停靠站。 */
export function TrainSheet(props: TrainSheetProps) {
  return (
    <Overlay
      open={props.open}
      onClose={props.onClose}
      variant={props.variant}
      anchor={props.anchor}
      placement="side"
      labelledBy="train-sheet-title"
    >
      {props.detail ? (
        <Content {...props} detail={props.detail} />
      ) : (
        <p className={styles.message} id="train-sheet-title">
          这列车已经不在线路上了。
        </p>
      )}
    </Overlay>
  );
}

const loadLabel: Record<CarLoad, string> = { low: "宽松", medium: "较多", high: "拥挤" };
/** 中间站超过这个数时折叠，只留前几站与终点。 */
const visibleStops = 4;

function Content({
  onClose,
  variant,
  detail,
  now,
  timeZone,
  loading,
}: TrainSheetProps & { detail: TrainDetail }) {
  const [expanded, setExpanded] = useState(false);
  const { line, section, here } = detail;
  const style = { "--line": line.color ?? fallbackLineColor } as CSSProperties;
  const clock = (t?: number) => (t ? formatClock(t, timeZone) : undefined);

  // 停靠站：过长时折叠中间站，保留已过站、列车附近几站、本站和终点。
  const upcoming = detail.stops;
  const keep = Math.max(visibleStops, upcoming.findIndex((s) => s.kind === "here") + 1);
  const hidden = !expanded && upcoming.length > keep + 2 ? upcoming.length - keep - 1 : 0;
  const shown = hidden ? [...upcoming.slice(0, keep), ...upcoming.slice(-1)] : upcoming;

  return (
    <div className={styles.body} style={style}>
      <header className={styles.header}>
        <ServiceBadge
          lineCode={line.lineCode}
          lineColor={line.color}
          serviceType={detail.serviceType}
        />
        <h2 id="train-sheet-title" className={styles.title}>
          往{detail.headsign ?? "—"}
        </h2>
        <button
          type="button"
          className={styles.close}
          aria-label={variant === "popover" ? "关闭" : "收起"}
          onClick={onClose}
          data-autofocus
        >
          {variant === "popover" ? <CloseIcon aria-hidden /> : <CollapseIcon aria-hidden />}
        </button>
      </header>

      <p className={styles.meta}>
        {detail.delayMinutes && (
          <span className={`${styles.chip} ${detail.delayMinutes >= 5 ? styles.severe : ""}`}>
            晚点 {detail.delayMinutes} 分
          </span>
        )}
        {detail.through && (
          <span className={styles.through}>
            {detail.through.map((l, i) => (
              <Fragment key={l.lineId}>
                {i > 0 && <span aria-hidden>→</span>}
                <ServiceBadge lineCode={l.lineCode} lineColor={l.color} size="s" />
              </Fragment>
            ))}
            直通
          </span>
        )}
        {detail.cars && <span>{detail.cars.length} 节</span>}
        <span>
          {section.at ? `停靠${section.at}` : `${section.from ?? "—"} → ${section.to ?? "—"}`}
        </span>
      </p>

      {here && (
        // 三列各有标签，连起来读：距本站 蒲塘桥 3 分钟 · 预计到达 08:15 · 站台 1。
        <section className={styles.arrival} aria-label="本站到站信息">
          <span className={styles.label}>
            {here.atStation ? "本站" : "距本站"} {here.stationName}
          </span>
          <span className={styles.timeLabel}>{here.atStation ? "预计发车" : "预计到达"}</span>
          {here.platform && <span className={styles.platformLabel}>站台</span>}
          {here.atStation ? (
            <span className={styles.state}>停靠中</span>
          ) : (
            <span className={styles.minutes}>
              <span className="num">{Math.max(1, Math.ceil((here.time - now) / 60_000))}</span>
              <span className={styles.unit}>分钟</span>
            </span>
          )}
          <span className={styles.time}>
            {here.planned && (
              <s className={`${styles.planned} num`} aria-label={`原定 ${clock(here.planned)}`}>
                {clock(here.planned)}
              </s>
            )}
            <span className={`${styles.actual} ${here.planned ? styles.late : ""} num`}>
              {clock(here.time)}
            </span>
          </span>
          {here.platform && <span className={`${styles.platformBox} num`}>{here.platform}</span>}
        </section>
      )}

      {!here && detail.notStopping && (
        <p className={styles.notice}>本列车不停靠{detail.notStopping}</p>
      )}

      {detail.cars && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>车厢拥挤</h3>
          <div className={styles.cars}>
            {detail.cars.map((load, i) => (
              <span key={i} className={`${styles.car} ${styles[load]}`}>
                <span className="num">{i + 1}</span>
                <span className="visually-hidden">号车{loadLabel[load]}</span>
              </span>
            ))}
            <span className={styles.direction} aria-label="行进方向" />
          </div>
          <p className={styles.legend}>
            {(["low", "medium", "high"] as const).map((load) => (
              <span key={load}>
                <i className={styles[load]} />
                {loadLabel[load]}
              </span>
            ))}
          </p>
        </section>
      )}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>停靠站</h3>
        {loading && detail.stops.every((s) => !s.time) && (
          <p className={styles.hint}>正在读取各站时刻…</p>
        )}
        <ol className={styles.stops}>
          {shown.map((stop, i) => {
            const index = upcoming.indexOf(stop);
            const isTrainAfter = !detail.position.dwelling && index === detail.position.afterIndex;
            const previous = upcoming[index - 1];
            return (
              <StopRow
                key={stop.code}
                stop={stop}
                lineIn={previous?.line ?? stop.line}
                time={clock(stop.time)}
                trainHere={detail.position.dwelling && index === detail.position.afterIndex}
                trainAfter={isTrainAfter}
                collapsedAfter={hidden > 0 && i === keep - 1 ? hidden : 0}
                onExpand={() => setExpanded(true)}
                first={i === 0}
                last={i === shown.length - 1}
              />
            );
          })}
        </ol>
      </section>
    </div>
  );
}

/** 线段颜色：行的上半段是驶入这一站的线路，下半段是驶出的线路，直通换线时在站点圆处变色。 */
function railColors(lineIn: RailStationLine, lineOut: RailStationLine) {
  return {
    "--line-in": lineIn.color ?? fallbackLineColor,
    "--line-out": lineOut.color ?? fallbackLineColor,
  } as CSSProperties;
}

/**
 * 停靠站一行：左侧粗线路与站点圆（已过为灰色），站名与标签，右侧时刻。
 * 列车位置用 ▼ 标在站上（停站）或两站之间（行驶中）。
 */
function StopRow({
  stop,
  lineIn,
  time,
  trainHere,
  trainAfter,
  collapsedAfter,
  onExpand,
  first,
  last,
}: {
  stop: DetailStop;
  /** 驶入这一站时所在的线路（上一站开出的线路）。 */
  lineIn: RailStationLine;
  time?: string;
  trainHere: boolean;
  trainAfter: boolean;
  collapsedAfter: number;
  onExpand: () => void;
  first: boolean;
  last: boolean;
}) {
  // 直通：从这一站起换到另一条线路运行。
  const entersLine = lineIn.lineCode !== stop.line.lineCode ? stop.line : undefined;
  const ahead = railColors(stop.line, stop.line);
  return (
    <>
      <li
        className={`${styles.stop} ${styles[stop.kind]} ${trainHere ? `${styles.dwell} ${styles.reached}` : ""} ${first ? styles.first : ""} ${last ? styles.last : ""}`}
        style={railColors(lineIn, stop.line)}
      >
        <span className={styles.rail} aria-hidden>
          <span className={styles.dot} />
          {trainHere && <span className={styles.train} />}
        </span>
        <span className={styles.stopName}>
          {stop.name}
          {stop.kind === "here" && <span className={styles.tag}>本站</span>}
          {stop.kind === "end" && <span className={styles.tag}>终点</span>}
          {trainHere && <span className={styles.status}>列车在此</span>}
          {entersLine && (
            <span className={styles.status}>
              直通 {entersLine.lineCode} {entersLine.lineName}
            </span>
          )}
        </span>
        <span className={`${styles.stopTime} num`}>
          {stop.kind === "passed" ? "已发车" : (time ?? "")}
        </span>
      </li>
      {trainAfter && (
        <li className={`${styles.stop} ${styles.trainRow} ${styles.reached}`} style={ahead}>
          <span className={styles.rail} aria-hidden>
            <span className={styles.train} />
          </span>
          <span className={styles.status}>列车当前位置</span>
        </li>
      )}
      {collapsedAfter > 0 && (
        <li className={`${styles.stop} ${styles.gap}`} style={ahead}>
          <span className={styles.rail} aria-hidden />
          <button type="button" className={styles.expand} onClick={onExpand}>
            展开另 {collapsedAfter} 站
          </button>
        </li>
      )}
    </>
  );
}
