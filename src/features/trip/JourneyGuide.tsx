import { useState, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router";
import BellIcon from "@material-symbols/svg-400/outlined/notifications.svg?react";
import BellOnIcon from "@material-symbols/svg-400/outlined/notifications_active.svg?react";
import ShareIcon from "@material-symbols/svg-400/outlined/share.svg?react";
import TicketIcon from "@material-symbols/svg-400/outlined/confirmation_number.svg?react";
import StarIcon from "@material-symbols/svg-400/outlined/star.svg?react";
import StarFillIcon from "@material-symbols/svg-400/outlined/star-fill.svg?react";
import TransferIcon from "@material-symbols/svg-400/outlined/transfer_within_a_station.svg?react";
import WalkIcon from "@material-symbols/svg-400/outlined/directions_walk.svg?react";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import { serviceTypeOf } from "@/features/board/departures.ts";
import { ticketFor } from "@/features/tickets/ticket.ts";
import { useTickets } from "@/features/tickets/ticketStore.ts";
import { useIssueTicket } from "@/features/tickets/useIssueTicket.ts";
import { fallbackLineColor } from "@/lib/lineColor.ts";
import type { RailCatalog } from "@/lib/railApi.ts";
import { sameHub } from "@/lib/hubs.ts";
import { useCatalog } from "@/lib/queries.ts";
import { useSettings } from "@/lib/settings.ts";
import { minutesBetween, transferCount } from "./journeyText.ts";
import type { LiveJourney, LiveLeg } from "./live.ts";
import type { RideLeg } from "./planner.ts";
import { clearReminder, setReminder, useReminder, type ReminderResult } from "./reminders.ts";
import { clockOf } from "./serviceDay.ts";
import { lineOf, platformOperator, platformText } from "./stations.ts";
import { stationParam, toggleSavedTrip, type TripRoute } from "./tripStore.ts";
import styles from "./JourneyGuide.module.css";

/**
 * 乘坐指南的几块内容，手机上的乘坐指南页与桌面「行程方案」右栏共用：
 * 概况（用时、换乘、起终点）与操作（收藏、提醒、分享），以及按顺序的时间线。
 */

/** 起止时刻「11:12 → 11:25」，用作标题。 */
export function JourneyTimes({ journey }: { journey: LiveJourney }) {
  return (
    <>
      <span className="num">{clockOf(journey.live.departure)}</span>
      <span className={styles.arrow}> → </span>
      <span className="num">{clockOf(journey.live.arrival)}</span>
    </>
  );
}

/**
 * 概况一行（用时 · 换乘 · 起终点）与三个操作。
 * tone：hero 放在深色标题块里（半透明按钮）；card 放在白色卡片里（浅灰按钮）。
 */
export function GuideSummary({
  journey,
  route,
  saved,
  dayStart,
  name,
  tone,
  goHref,
}: {
  journey: LiveJourney;
  route: TripRoute;
  saved: boolean;
  /** 乘车 GO 页面的地址（带着找回这个方案的参数）。 */
  goHref: string;
  /** 方案所在运营日 0 点的绝对时刻（毫秒），用来算提醒的时刻。 */
  dayStart: number;
  name: (code: string) => string;
  tone: "hero" | "card";
}) {
  const transfers = transferCount(journey.legs);
  return (
    <div className={tone === "card" ? styles.onCard : styles.onHero}>
      <p className={styles.meta}>
        {minutesBetween(journey.live.departure, journey.live.arrival)} 分 ·{" "}
        {transfers === 0 ? "直达" : `换乘 ${transfers} 次`} · {name(stationParam(route.from))} →{" "}
        {name(stationParam(route.to))}
      </p>
      <Actions journey={journey} route={route} saved={saved} dayStart={dayStart} name={name} />
      {/* 乘车 GO：跟着这趟行程走，实时提示该在哪上车、还有几站、在哪下车换乘。 */}
      <Link className={styles.go} to={goHref}>
        GO · 开始乘车
      </Link>
    </div>
  );
}

/** 收藏这条行程、出发前提醒、分享、生成仿真车票。 */
function Actions({
  journey,
  route,
  saved,
  dayStart,
  name,
}: {
  journey: LiveJourney;
  route: TripRoute;
  saved: boolean;
  dayStart: number;
  name: (code: string) => string;
}) {
  // 桌面上换选一个方案时这里不会重新挂载：提醒状态按 key 订阅，提示文字也只属于当时的方案。
  const key = `${stationParam(route.from)}-${stationParam(route.to)}-${dayStart}-${journey.departure}`;
  const reminded = useReminder(key);
  const [noteOf, setNoteOf] = useState<{ key: string; text: string }>();
  const note = noteOf?.key === key ? noteOf.text : undefined;
  const setNote = (text: string | undefined) => setNoteOf(text ? { key, text } : undefined);
  const issueTicket = useIssueTicket();
  const navigate = useNavigate();
  const catalog = useCatalog();
  // 区间票：这两站之间当天已经有能用的票，就打开它，不再出一张。
  const ticket = ticketFor(useTickets(), route, dayStart + journey.live.departure * 1000, (a, b) =>
    sameHub(catalog.data, a, b),
  );
  const { remindMinutes } = useSettings();
  const firstRide = journey.legs.find((l): l is LiveLeg & RideLeg => l.kind === "ride");
  const summary = `${clockOf(journey.live.departure)} ${name(stationParam(route.from))} → ${clockOf(journey.live.arrival)} ${name(stationParam(route.to))}`;

  const remind = async () => {
    if (reminded) {
      clearReminder(key);
      setNote(undefined);
      return;
    }
    // 按预计出发算绝对时刻，不依赖「现在」（它每 15 秒才更新一次）。
    const fireAt = dayStart + (journey.live.departure - remindMinutes * 60) * 1000;
    const result: ReminderResult = await setReminder(
      key,
      fireAt,
      // 标题带上哪班车：锁屏上不用点开就知道要坐哪一班。
      `${remindMinutes} 分钟后出发${firstRide ? ` · ${firstRide.lineCode} 往 ${firstRide.headsign}` : ""}`,
      `${summary}${firstRide?.platform ? `，${platformText(catalog.data, route.from.serverId, firstRide)}上车` : ""}`,
    );
    setNote(
      {
        set: `将在出发前 ${remindMinutes} 分钟提醒（需保持 TrainLink 打开）`,
        denied: "没有通知权限，可在浏览器设置里允许通知",
        unsupported: "这个浏览器不支持网页提醒",
        past: `离出发不到 ${remindMinutes} 分钟了`,
      }[result],
    );
  };

  const share = async () => {
    const data = { title: "TrainLink 行程", text: summary, url: window.location.href };
    try {
      if (navigator.share) {
        await navigator.share(data);
      } else {
        await navigator.clipboard.writeText(`${summary}\n${data.url}`);
        setNote("已复制行程链接");
      }
    } catch {
      // 用户取消分享：什么也不做。
    }
  };

  return (
    <>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          aria-pressed={saved}
          onClick={() => toggleSavedTrip(route, (a, b) => sameHub(catalog.data, a, b))}
        >
          {saved ? <StarFillIcon aria-hidden /> : <StarIcon aria-hidden />}
          {saved ? "已收藏" : "收藏"}
        </button>
        <button type="button" className={styles.action} aria-pressed={reminded} onClick={remind}>
          {reminded ? <BellOnIcon aria-hidden /> : <BellIcon aria-hidden />}
          {reminded ? "已提醒" : "提醒"}
        </button>
        <button type="button" className={styles.action} onClick={share}>
          <ShareIcon aria-hidden />
          分享
        </button>
        {/* 这段区间的仿真车票（不接入真实系统）：已有能用的就打开，没有就出一张区间票放进票夹并打开。 */}
        <button
          type="button"
          className={styles.action}
          onClick={() =>
            ticket ? navigate(`/tickets/${ticket.id}`) : issueTicket(route, journey, dayStart)
          }
        >
          <TicketIcon aria-hidden />
          车票
        </button>
      </div>
      {note && <p className={styles.note}>{note}</p>}
    </>
  );
}

type Item =
  | {
      kind: "stop";
      code: string;
      time: number;
      planned: number;
      role: "start" | "change" | "end";
      /**
       * 同站换乘（包括枢纽里换另一家运营方）：到站后离下一班开车还有几秒，与至少要留的秒数。
       * 换乘写在这一站里，不另起一行。
       */
      change?: { seconds: number; minimum: number };
    }
  | { kind: "ride"; leg: LiveLeg & RideLeg; showTime: boolean }
  | { kind: "walk"; seconds: number; to: string };

/**
 * 把各段排成时间线：车站与乘车交替出现。
 * 同站换乘就在那一站里写一句（线路在站点圆处换色，不断开）。枢纽里换另一家运营方也一样：
 * 乘客看来是同一个站，不画成步行（规划里它是一段站内换乘，见 timetable.ts 的 withHubTransfers）。
 * 只有站外换乘（步行到另一站）才单独一行，画成虚线。
 */
function timelineItems(legs: LiveLeg[]): Item[] {
  const items: Item[] = [];
  legs.forEach((leg, i) => {
    const previous = legs[i - 1];
    const next = legs[i + 1];
    // 枢纽里换另一家：乘车 → 站内换乘 → 乘车，画成一个车站上的换乘。
    const hubChange = (walk: LiveLeg | undefined, after: LiveLeg | undefined) =>
      walk?.kind === "walk" && walk.inStation && after?.kind === "ride";
    if (leg.kind === "ride") {
      const afterHubChange = hubChange(previous, leg) && legs[i - 2]?.kind === "ride";
      const changeAt = next?.kind === "ride" ? next : undefined;
      const hubNext = hubChange(next, legs[i + 2]) ? legs[i + 2] : undefined;
      if (!previous || (previous.kind === "walk" && !afterHubChange)) {
        items.push({
          kind: "stop",
          code: leg.from,
          time: leg.live.departure,
          planned: leg.departure,
          role: previous ? "change" : "start",
        });
      }
      items.push({ kind: "ride", leg, showTime: previous?.kind === "ride" || !!afterHubChange });
      items.push({
        kind: "stop",
        code: leg.to,
        time: leg.live.arrival,
        planned: leg.arrival,
        role: next ? "change" : "end",
        change: changeAt
          ? { seconds: changeAt.live.departure - leg.live.arrival, minimum: leg.changeSeconds }
          : hubNext && next?.kind === "walk"
            ? { seconds: hubNext.live.departure - leg.live.arrival, minimum: next.seconds }
            : undefined,
      });
    } else if (hubChange(leg, next) && previous?.kind === "ride") {
      // 枢纽换乘已经写在上一站里。
    } else {
      if (!previous) {
        items.push({
          kind: "stop",
          code: leg.from,
          time: leg.departure,
          planned: leg.departure,
          role: "start",
        });
      }
      items.push({ kind: "walk", seconds: leg.seconds, to: leg.to });
      if (!next) {
        items.push({
          kind: "stop",
          code: leg.to,
          time: leg.arrival,
          planned: leg.arrival,
          role: "end",
        });
      }
    }
  });
  return items;
}

/**
 * 时间线：左列时刻，中间一条线路（乘车段是线路色，换乘是虚线），右边车站与乘车说明。
 * 晚点时时刻用琥珀色，原定时刻划掉写在下面。
 */
export function Timeline({
  journey,
  catalog,
  serverId,
  name,
}: {
  journey: LiveJourney;
  catalog: RailCatalog | undefined;
  serverId: string;
  name: (code: string) => string;
}) {
  const items = timelineItems(journey.legs);
  const colorOf = (code: string, operatorCode: string) =>
    lineOf(catalog, serverId, code, operatorCode)?.color ?? fallbackLineColor;
  // 车站上下两半的线路色：取前后相邻的乘车段。
  const rideColors = (index: number, step: -1 | 1) => {
    const item = items[index + step];
    return item?.kind === "ride"
      ? colorOf(
          step === -1 ? item.leg.lineCodes.at(-1)! : item.leg.lineCodes[0]!,
          item.leg.operatorCode,
        )
      : undefined;
  };

  return (
    <ol className={styles.timeline}>
      {items.map((item, i) => {
        if (item.kind === "stop") {
          const above = rideColors(i, -1);
          const below = rideColors(i, 1);
          const late = item.time - item.planned >= 60;
          return (
            <li
              key={i}
              className={`${styles.item} ${styles.stop} ${styles[item.role]}`}
              style={{ "--above": above, "--below": below } as CSSProperties}
            >
              <span className={styles.time}>
                <span className={`num ${late ? styles.late : ""}`}>{clockOf(item.time)}</span>
                {late && <s className="num">{clockOf(item.planned)}</s>}
              </span>
              <span
                className={`${styles.rail} ${above ? "" : styles.noAbove} ${below ? "" : styles.noBelow}`}
                aria-hidden
              >
                <span className={styles.dot} />
              </span>
              <span className={styles.stationText}>
                <span className={styles.stationName}>{name(item.code)}</span>
                {item.change && (
                  <ChangeNote
                    arrival={item.time}
                    departure={item.time + item.change.seconds}
                    minimum={item.change.minimum}
                  />
                )}
              </span>
            </li>
          );
        }
        if (item.kind === "ride") {
          const { leg } = item;
          const colors = leg.lineCodes.map((code) => colorOf(code, leg.operatorCode));
          const line = lineOf(catalog, serverId, leg.lineCode, leg.operatorCode);
          // 枢纽里两家都有站台 1：上车站台上方标出是哪一家的。
          const operator = platformOperator(catalog, serverId, leg);
          const through = leg.lineCodes
            .slice(1)
            .map((code) => lineOf(catalog, serverId, code, leg.operatorCode));
          return (
            <li
              key={i}
              className={`${styles.item} ${styles.ride}`}
              style={{ "--ride": rideGradient(colors) } as CSSProperties}
            >
              <span className={styles.time}>
                {item.showTime && <span className="num">{clockOf(leg.live.departure)}</span>}
              </span>
              <span className={styles.rail} aria-hidden />
              <div className={styles.rideInfo}>
                <div className={styles.rideHead}>
                  <ServiceBadge
                    lineCode={leg.lineCode}
                    lineColor={line?.color}
                    serviceType={serviceTypeOf({ routeId: leg.tripId })}
                  />
                  <span className={styles.headsign}>往{leg.headsign}</span>
                  {leg.platform && (
                    <span className={styles.platform}>
                      {operator && <span className={styles.platformOperator}>{operator}</span>}
                      <span className={styles.platformNumber}>
                        站台 <span className={`${styles.platformBox} num`}>{leg.platform}</span>
                      </span>
                    </span>
                  )}
                </div>
                <p className={styles.rideMeta}>
                  乘 {leg.stops} 站 · 约 {minutesBetween(leg.live.departure, leg.live.arrival)} 分
                  {through.map((l) => l && ` · 直通 ${l.code} ${l.name}`)}
                </p>
              </div>
            </li>
          );
        }
        return (
          <li key={i} className={`${styles.item} ${styles.transfer}`}>
            <span className={styles.time} />
            <span className={styles.rail} aria-hidden />
            <p className={styles.transferText}>
              <WalkIcon aria-hidden />
              步行约 {Math.ceil(item.seconds / 60)} 分至{name(item.to)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * 同站换乘的说明：「站内换乘 · 3 分钟」。不足这一站要求的最少换乘时间（minimum，多数站 2 分钟，
 * SURC 1 分钟）用琥珀色，写「只有 1 分钟」，与行程方案里「换乘可能赶不上」一致。
 */
function ChangeNote({
  arrival,
  departure,
  minimum,
}: {
  arrival: number;
  departure: number;
  minimum: number;
}) {
  // 分钟数按页面上写出来的两个时刻相减（11:46 → 11:49 是 3 分钟），不按秒数取整，免得对不上。
  const minutes = Math.max(0, Math.floor(departure / 60) - Math.floor(arrival / 60));
  const seconds = departure - arrival;
  const tight = seconds < minimum;
  return (
    <span className={`${styles.changeNote} ${tight ? styles.tight : ""}`}>
      <TransferIcon aria-hidden />
      站内换乘 · {tight ? `只有 ${minutes} 分钟` : `${minutes} 分钟`}
    </span>
  );
}

/** 乘车段的线路色：一条线就是纯色；直通车从上到下分成几段颜色。 */
function rideGradient(colors: string[]): string {
  if (colors.length < 2) return colors[0] ?? fallbackLineColor;
  const step = 100 / colors.length;
  return `linear-gradient(${colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(", ")})`;
}
