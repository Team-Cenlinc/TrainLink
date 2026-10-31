import type { ReactNode } from "react";
import CampaignIcon from "@material-symbols/svg-400/outlined/campaign.svg?react";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import type { RailLine } from "@/lib/railApi.ts";
import type { ServiceAlert } from "@/lib/realtime.ts";
import { formatClock } from "@/lib/time.ts";
import { stateAlert, type LineStatus } from "./networkStatus.ts";
import { StateChip, stateIcon } from "./StateChip.tsx";
import { useNetworkStatus } from "./useNetworkStatus.ts";
import styles from "./StatusPage.module.css";

/**
 * 运行状态，与看板同一套结构：顶部纯色标题块，下面是圆角面板；
 * 面板里每组一个标题（同看板「往 ×× · 站台 N」的标题）加一张白色卡片。
 * 分组：需要留意（停运、班次取消、晚点，按严重程度）、其他线路、通告（一般公告与全网通告，每条一次）。
 */
export function StatusPage() {
  const { status, loading, error, updatedAt, timeZone } = useNetworkStatus();
  const lineByCode = new Map(
    [...(status?.attention ?? []), ...(status?.others ?? [])].map((s) => [s.line.code, s.line]),
  );
  const attention = status?.attention.length ?? 0;
  // 概况前的图标跟着最严重的一项走；全部正常时是对勾。
  const SummaryIcon = stateIcon[status?.attention[0]?.state ?? "normal"];

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <h1 className={styles.name}>运行状态</h1>
        <div className={styles.summaryRow}>
          <span className={styles.summary}>
            {status && <SummaryIcon aria-hidden />}
            {!status
              ? "正在读取…"
              : attention > 0
                ? `${attention} 条线路需要留意`
                : "全部线路运行正常"}
          </span>
          {updatedAt !== undefined && (
            <span className={styles.clock}>
              更新 <span className="num">{formatClock(updatedAt, timeZone)}</span>
            </span>
          )}
        </div>
      </header>

      <main className={styles.panel}>
        {!status ? (
          <p className={styles.message}>
            {loading ? "正在读取运行状态…" : error ? "暂时读不到运行状态，稍后再试。" : null}
          </p>
        ) : (
          <div className={styles.groups}>
            <div className={styles.lines}>
              {attention > 0 && (
                <Group title="需要留意" count={attention}>
                  {status.attention.map((s) => (
                    <LineRow key={s.line.id} status={s} />
                  ))}
                </Group>
              )}
              <Group title={attention > 0 ? "其他线路" : "全部线路"}>
                {status.others.map((s) => (
                  <LineRow key={s.line.id} status={s} />
                ))}
              </Group>
            </div>
            {status.bulletins.length > 0 && (
              <div className={styles.bulletins}>
                <Group title="通告" count={status.bulletins.length}>
                  {status.bulletins.map((alert) => (
                    <Bulletin key={alert.id} alert={alert} lineByCode={lineByCode} />
                  ))}
                </Group>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/** 一组：标题（可带数量，按基线对齐）加一张白色卡片。 */
function Group({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className={styles.group}>
      <h2 className={styles.heading}>
        {title}
        {count !== undefined && <span className={`${styles.count} num`}>{count}</span>}
      </h2>
      <ul className={styles.card}>{children}</ul>
    </section>
  );
}

/**
 * 一条线路：线路色牌（与发车列表同一组件）、线路名、状态标签，下面一行写状态的说明。
 * 说明取与状态对应的通告（例如「探索线：全线停运」）的正文；标题和状态重复，不写。
 */
function LineRow({ status }: { status: LineStatus }) {
  const { line } = status;
  const detail = stateAlert(status)?.body;
  return (
    <li className={styles.row}>
      <ServiceBadge lineCode={line.code} lineColor={line.color} />
      <div className={styles.main}>
        <span className={styles.lineName}>{line.name}</span>
        {detail && <span className={styles.body}>{detail}</span>}
      </div>
      <StateChip status={status} />
    </li>
  );
}

/** 一条通告：标题、涉及的线路（小号色牌；全网通告写「全网」）、正文（保留原有的换行）。 */
function Bulletin({
  alert,
  lineByCode,
}: {
  alert: ServiceAlert;
  lineByCode: Map<string, RailLine>;
}) {
  return (
    <li className={`${styles.row} ${styles.bulletin}`}>
      <CampaignIcon className={styles.bulletinIcon} aria-hidden />
      <div className={styles.main}>
        <span className={styles.scope}>
          {alert.lineCodes.length === 0 ? (
            <span className={styles.scopeTag}>全网</span>
          ) : (
            alert.lineCodes.map((code) => (
              <ServiceBadge
                key={code}
                lineCode={code}
                lineColor={lineByCode.get(code)?.color}
                size="s"
              />
            ))
          )}
        </span>
        <span className={styles.lineName}>{alert.title}</span>
        {alert.body && <span className={styles.body}>{alert.body}</span>}
      </div>
    </li>
  );
}
