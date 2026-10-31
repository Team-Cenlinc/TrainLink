import { Link, useSearchParams } from "react-router";
import ChevronIcon from "@material-symbols/svg-400/outlined/chevron_right.svg?react";
import { Group, Page, PanelMessage } from "@/components/Page.tsx";
import { useHomeStation } from "@/lib/homeStation.ts";
import { useLayout } from "@/lib/useLayout.ts";
import { useCatalog } from "@/lib/queries.ts";
import type { RailCatalog } from "@/lib/railApi.ts";
import { changeNotes, minutesBetween, stationName, transferCount } from "./journeyText.ts";
import { GuideSummary, JourneyTimes, Timeline } from "./JourneyGuide.tsx";
import { LegStrip } from "./LegStrip.tsx";
import type { LiveJourney } from "./live.ts";
import { clockOf } from "./serviceDay.ts";
import { stationInfo } from "./stations.ts";
import { isSavedTrip, stationFromParam, stationParam, useSavedTrips } from "./tripStore.ts";
import { useJourneys } from "./useJourneys.ts";
import styles from "./ResultsPage.module.css";

/** "08:30" → 运营日内的秒数。 */
export function secondsOfClock(value: string | null): number | undefined {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 : undefined;
}

/**
 * 行程方案（v06 Mobile 03）：接下来几班可乘的方案，一个比一个晚出发。
 * 时刻按实时数据更新：晚点时原定时刻划掉、预计时刻用琥珀色；已取消的车次不会出现；
 * 换乘可能赶不上时标出来。手机与平板上点一个方案进入乘坐指南；
 * 桌面上分两栏（同看板的发车区与列车位置），右栏直接显示选中方案的乘坐指南。
 */
export function ResultsPage() {
  const [params, setParams] = useSearchParams();
  const layout = useLayout();
  const home = useHomeStation();
  const catalog = useCatalog();
  const saved = useSavedTrips();
  const from = stationFromParam(params.get("from"), home.serverId);
  const to = stationFromParam(params.get("to"), home.serverId);
  const at = secondsOfClock(params.get("at"));
  const { journeys, nowSeconds, loading, error } = useJourneys(from, to, at, 6);
  const name = (code: string) => stationName(catalog.data, home.serverId, code);
  const fromInfo = from && stationInfo(catalog.data, from);
  const toInfo = to && stationInfo(catalog.data, to);

  // 桌面：左边方案列表，右边选中方案的乘坐指南（选中的写进网址 dep，刷新后还在）；
  // 手机与平板：点方案进入单独的乘坐指南页。
  const split = layout === "wide";
  const selectedDep = Number(params.get("dep"));
  const selected =
    journeys?.find((j) => j.departure === selectedDep) ?? (split ? journeys?.[0] : undefined);
  const select = (journey: LiveJourney) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("dep", String(journey.departure));
        return next;
      },
      { replace: true },
    );

  const list =
    from && to && journeys && journeys.length > 0 ? (
      <Group title="接下来" count={journeys.length}>
        {journeys.map((journey) => (
          <JourneyRow
            key={journey.departure}
            journey={journey}
            href={`/trip/guide?from=${stationParam(from)}&to=${stationParam(to)}&dep=${journey.departure}`}
            onSelect={split ? () => select(journey) : undefined}
            selected={split && journey === selected}
            nowSeconds={nowSeconds}
            catalog={catalog.data}
            serverId={from.serverId}
          />
        ))}
      </Group>
    ) : null;

  return (
    <Page
      back="行程方案"
      narrow={!split}
      title={
        <>
          {fromInfo?.name ?? "—"}
          <span className={styles.arrow}>→</span>
          {toInfo?.name ?? "—"}
        </>
      }
      hero={
        <p className={styles.when}>
          今天 · {at !== undefined ? `${clockOf(at)} 以后出发` : "现在出发"}
        </p>
      }
    >
      {!from || !to ? (
        <PanelMessage>没有选好起点和终点。</PanelMessage>
      ) : !journeys ? (
        <PanelMessage>
          {loading ? "正在读取时刻表…" : error ? "时刻表暂时读不到，稍后再试。" : null}
        </PanelMessage>
      ) : journeys.length === 0 ? (
        <PanelMessage>接下来没有能到达的车次。</PanelMessage>
      ) : split && selected ? (
        <div className={styles.split}>
          <div className={styles.listColumn}>{list}</div>
          <section className={styles.guideColumn} aria-label="乘坐指南">
            <h2 className={styles.guideHeading}>乘坐指南</h2>
            <div className={styles.guideCard}>
              <p className={styles.guideTimes}>
                <JourneyTimes journey={selected} />
              </p>
              <GuideSummary
                journey={selected}
                route={{ from, to }}
                saved={isSavedTrip(saved, { from, to })}
                nowSeconds={nowSeconds}
                name={name}
                tone="card"
              />
              <Timeline
                journey={selected}
                catalog={catalog.data}
                serverId={from.serverId}
                name={name}
              />
            </div>
          </section>
        </div>
      ) : (
        list
      )}
    </Page>
  );
}

/**
 * 一个方案：起止时刻与用时；「N 分后出发」与晚点、换乘提醒；线路条；上车站台与换乘说明。
 */
function JourneyRow({
  journey,
  href,
  onSelect,
  selected,
  nowSeconds,
  catalog,
  serverId,
}: {
  journey: LiveJourney;
  href: string;
  /** 桌面：点方案在右栏显示指南，不跳页。 */
  onSelect?: () => void;
  selected: boolean;
  nowSeconds: number;
  catalog: RailCatalog | undefined;
  serverId: string;
}) {
  const { live } = journey;
  const late = live.departure - journey.departure >= 60;
  const waitMinutes = Math.ceil((live.departure - nowSeconds) / 60);
  const transfers = transferCount(journey.legs);
  const firstRide = journey.legs.find((l) => l.kind === "ride");
  const notes = [
    firstRide?.platform ? `${firstRide.platform} 号站台上车` : undefined,
    ...changeNotes(journey.legs, catalog, serverId),
  ].filter(Boolean);

  const content = (
    <>
      <span className={styles.times}>
        {late && <s className={`${styles.planned} num`}>{clockOf(journey.departure)}</s>}
        <span className={`num ${late ? styles.late : ""}`}>{clockOf(live.departure)}</span>
        <span className={styles.arrow}>→</span>
        <span className="num">{clockOf(live.arrival)}</span>
        <span className={styles.duration}>
          <span className="num">{minutesBetween(live.departure, live.arrival)}</span> 分
        </span>
      </span>

      <span className={styles.meta}>
        <span className={waitMinutes <= 0 ? styles.now : styles.wait}>
          {waitMinutes <= 0 ? "正在出发" : `${waitMinutes} 分后出发`}
        </span>
        {journey.delayMinutes >= 1 && (
          <span className={`${styles.chip} ${styles.caution}`}>晚点 {journey.delayMinutes} 分</span>
        )}
        {journey.riskyChange && (
          <span className={`${styles.chip} ${styles.severe}`}>换乘可能赶不上</span>
        )}
        <span className={styles.transfers}>
          {transfers === 0 ? "直达" : `换乘 ${transfers} 次`}
        </span>
      </span>

      <LegStrip legs={journey.legs} catalog={catalog} serverId={serverId} />

      <span className={styles.notes}>
        <span>{notes.join(" · ")}</span>
        {!onSelect && <ChevronIcon className={styles.chevron} aria-hidden />}
      </span>
    </>
  );
  return (
    <li className={selected ? styles.selected : undefined}>
      {onSelect ? (
        <button type="button" className={styles.journey} aria-pressed={selected} onClick={onSelect}>
          {content}
        </button>
      ) : (
        <Link to={href} className={styles.journey}>
          {content}
        </Link>
      )}
    </li>
  );
}
