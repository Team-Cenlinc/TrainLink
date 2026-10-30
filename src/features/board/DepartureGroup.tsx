import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import type { DepartureStatus, DepartureView, PlatformGroup } from "./departures.ts";
import styles from "./DepartureGroup.module.css";

/**
 * 一个站台方向的发车列表：标题「往 ×× · 站台 N」，下面是一张卡片。
 * 第一班用大号（lead），后续班次紧凑显示，只写差异。
 * limit 为显示的班次数，随面板档位变化：下拉 1 班、默认 4 班、推上不限。
 */
export function DepartureGroup({ group, limit }: { group: PlatformGroup; limit?: number }) {
  const [lead, ...rest] = limit ? group.departures.slice(0, limit) : group.departures;
  return (
    <section className={styles.group}>
      <h2 className={styles.heading}>
        <span className={styles.toward}>往</span>
        <span className={styles.destinations}>{group.destinations.slice(0, 2).join("、")}</span>
        <span className={styles.platformLabel}>{group.platformPending ? "站台待定" : "站台"}</span>
        <span className={`${styles.platform} ${group.platformPending ? styles.pending : ""} num`}>
          {group.platform}
        </span>
      </h2>
      <ol className={styles.card}>
        {lead && <DepartureRow departure={lead} lead />}
        {rest.map((departure) => (
          <DepartureRow key={departure.key} departure={departure} />
        ))}
      </ol>
    </section>
  );
}

function DepartureRow({ departure, lead = false }: { departure: DepartureView; lead?: boolean }) {
  const dimmed = departure.status.kind === "planned" || departure.status.kind === "cancelled";
  return (
    <li className={`${styles.row} ${lead ? styles.lead : ""} ${dimmed ? styles.dimmed : ""}`}>
      <ServiceBadge
        lineCode={departure.lineCode}
        lineColor={departure.lineColor}
        serviceType={departure.serviceType}
      />
      <div className={styles.main}>
        <span
          className={`${styles.destination} ${departure.status.kind === "cancelled" ? styles.struck : ""}`}
        >
          {departure.destinationName}
        </span>
        <StatusText status={departure.status} />
      </div>
      <div className={styles.time}>
        <MinutesText departure={departure} lead={lead} />
        {departure.clock && <span className={`${styles.clock} num`}>{departure.clock}</span>}
      </div>
    </li>
  );
}

/** 右侧大数字：进站、停靠中、取消时用文字代替分钟数。 */
function MinutesText({ departure, lead }: { departure: DepartureView; lead: boolean }) {
  const { status } = departure;
  if (status.kind === "arriving") return <span className={styles.word}>进站</span>;
  if (status.kind === "boarding") return <span className={styles.word}>停靠中</span>;
  if (status.kind === "cancelled") return <span className={styles.word}>取消</span>;
  if (departure.minutes === null) return null;
  return (
    <span className={styles.minutes}>
      <span className={`${lead ? styles.bigNumber : styles.number} num`}>{departure.minutes}</span>
      <span className={styles.unit}>分</span>
    </span>
  );
}

/** 终点下方的状态词；准点时不显示，保持清爽。 */
function StatusText({ status }: { status: DepartureStatus }) {
  if (status.kind === "planned") return <span className={styles.plannedTag}>计划</span>;
  if (status.kind === "delayed") {
    return (
      <span className={`${styles.chip} ${status.severe ? styles.severe : styles.caution}`}>
        晚点 {status.minutes} 分
      </span>
    );
  }
  return null;
}
