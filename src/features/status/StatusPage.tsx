import CampaignIcon from "@material-symbols/svg-400/outlined/campaign.svg?react";
import { Group, Page, PanelMessage } from "@/components/Page.tsx";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import type { RailLine } from "@/lib/railApi.ts";
import type { ServiceAlert } from "@/lib/realtime.ts";
import { formatClock } from "@/lib/time.ts";
import { stateAlert, statusSummary, type LineStatus } from "./networkStatus.ts";
import { StateChip, stateIcon } from "./StateChip.tsx";
import { useNetworkStatus } from "./useNetworkStatus.ts";
import styles from "./StatusPage.module.css";

/**
 * 运行状态，用各页共用的外壳（components/Page.tsx）：顶部纯色标题块，下面是圆角面板，
 * 面板里每组一个标题加一张白色卡片。
 * 分组：需要留意（停运、班次取消、晚点，按严重程度）、其他线路、通告（一般公告与全网通告，每条一次）。
 * 没有内容的组不显示。列车或行程更新读不到时，停运与班次取消照常显示，上方注明晚点信息暂缺。
 */
export function StatusPage() {
  const { status, loading, liveLoading, error, updatedAt, timeZone } = useNetworkStatus();
  // 通告里的线路以「运营方码:线路码」对应到目录里的线路（不同运营方可能有同码的线路）。
  const lineByKey = new Map(
    [...(status?.attention ?? []), ...(status?.others ?? [])].map((s) => [
      `${s.operatorCode}:${s.line.code}`,
      s.line,
    ]),
  );
  const attention = status?.attention.length ?? 0;
  const summary = status && statusSummary(status);
  // 概况前的图标跟着最严重的一项走；全部正常时是对勾，说不准时不放图标。
  const SummaryIcon = summary?.state && stateIcon[summary.state];

  return (
    <Page
      title="运行状态"
      hero={
        <div className={styles.summaryRow}>
          <span className={styles.summary}>
            {SummaryIcon && <SummaryIcon aria-hidden />}
            {summary?.text ?? "正在读取…"}
          </span>
          {updatedAt !== undefined && (
            <span className={styles.clock}>
              更新 <span className="num">{formatClock(updatedAt, timeZone)}</span>
            </span>
          )}
        </div>
      }
    >
      {!status ? (
        <PanelMessage>
          {loading ? "正在读取运行状态…" : error ? "暂时读不到运行状态，稍后再试。" : null}
        </PanelMessage>
      ) : (
        <div className={styles.groups}>
          <div className={styles.column}>
            {!status.delaysKnown && !liveLoading && (
              <p className={styles.note}>晚点信息暂时读不到，下面只列出停运与班次取消。</p>
            )}
            {attention > 0 && (
              <Group title="需要留意" count={attention}>
                {status.attention.map((s) => (
                  <LineRow key={s.line.id} status={s} reading={liveLoading} />
                ))}
              </Group>
            )}
            {status.others.length > 0 && (
              <Group title={attention > 0 ? "其他线路" : "全部线路"}>
                {status.others.map((s) => (
                  <LineRow key={s.line.id} status={s} reading={liveLoading} />
                ))}
              </Group>
            )}
          </div>
          {status.bulletins.length > 0 && (
            <div className={styles.column}>
              <Group title="通告" count={status.bulletins.length}>
                {status.bulletins.map((alert) => (
                  <Bulletin key={alert.id} alert={alert} lineByKey={lineByKey} />
                ))}
              </Group>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}

/**
 * 一条线路：线路色牌（与发车列表同一组件）、线路名、状态标签，下面一行写状态的说明。
 * 说明取与状态对应的通告（例如「探索线：全线停运」）的正文；标题和状态重复，不写。
 */
function LineRow({ status, reading }: { status: LineStatus; reading: boolean }) {
  const { line } = status;
  const detail = stateAlert(status)?.body;
  return (
    <li className={styles.row}>
      <ServiceBadge lineCode={line.code} lineColor={line.color} />
      <div className={styles.main}>
        <span className={styles.lineName}>{line.name}</span>
        {detail && <span className={styles.body}>{detail}</span>}
      </div>
      <StateChip status={status} reading={reading} />
    </li>
  );
}

/** 一条通告：标题、涉及的线路（小号色牌；全网通告写「全网」）、正文（保留原有的换行）。 */
function Bulletin({ alert, lineByKey }: { alert: ServiceAlert; lineByKey: Map<string, RailLine> }) {
  return (
    <li className={`${styles.row} ${styles.bulletin}`}>
      <CampaignIcon className={styles.bulletinIcon} aria-hidden />
      <div className={styles.main}>
        <span className={styles.scope}>
          {alert.lines.length === 0 ? (
            <span className={styles.scopeTag}>全网</span>
          ) : (
            alert.lines.map(({ operatorCode, lineCode }) => {
              const key = `${operatorCode}:${lineCode}`;
              return (
                <ServiceBadge
                  key={key}
                  lineCode={lineCode}
                  lineColor={lineByKey.get(key)?.color}
                  size="s"
                />
              );
            })
          )}
        </span>
        <span className={styles.lineName}>{alert.title}</span>
        {alert.body && <span className={styles.body}>{alert.body}</span>}
      </div>
    </li>
  );
}
