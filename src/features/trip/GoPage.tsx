import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router";
import BellIcon from "@material-symbols/svg-400/outlined/notifications.svg?react";
import BellOnIcon from "@material-symbols/svg-400/outlined/notifications_active.svg?react";
import TicketIcon from "@material-symbols/svg-400/outlined/confirmation_number.svg?react";
import TransferIcon from "@material-symbols/svg-400/outlined/transfer_within_a_station.svg?react";
import WalkIcon from "@material-symbols/svg-400/outlined/directions_walk.svg?react";
import { Group, Page, PanelMessage } from "@/components/Page.tsx";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import {
  GapRow,
  StopList,
  StopRow,
  StopStatus,
  StopTag,
  TrainRow,
} from "@/components/StopList.tsx";
import { ticketFor, usedTicketFor } from "@/features/tickets/ticket.ts";
import { TicketSheet } from "@/features/tickets/TicketSheet.tsx";
import { useIssueTicket } from "@/features/tickets/useIssueTicket.ts";
import { useTickets } from "@/features/tickets/ticketStore.ts";
import { useHomeStation, type HomeStation } from "@/lib/homeStation.ts";
import { sameHub } from "@/lib/hubs.ts";
import { useCatalog } from "@/lib/queries.ts";
import { stationName } from "./journeyText.ts";
import type { LiveJourney, LiveLeg } from "./live.ts";
import { clearReminder, setReminder, useAnyReminder, type ReminderResult } from "./reminders.ts";
import {
  alightReminderAt,
  collapsedStops,
  rideText,
  type CollapsedItem,
  type RideStatus,
  type RideStop,
} from "./ride.ts";
import {
  endRide,
  rideKey,
  rideReminderPrefix,
  startRide,
  useActiveRide,
  type ActiveRide,
} from "./rideStore.ts";
import { clockOf } from "./serviceDay.ts";
import { stationFromParam, stationParam, type TripRoute } from "./tripStore.ts";
import { useRide } from "./useRide.ts";
import styles from "./GoPage.module.css";

/**
 * 乘车 GO：从乘坐指南点「GO」进来，跟着这趟行程走。
 * 大字写此刻该做什么（在哪个站台上车、还有几站、下一站下车换乘哪班车），
 * 下面是整趟进度条、下车提醒、车票二维码入口和接下来的几段。
 * 按实时列车位置推进（见 ride.ts），每 5 秒重算一次；实时数据每 15 秒更新。
 * 网址参数与乘坐指南相同，按它们找回同一个方案。
 */
export function GoPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ride = useRide(params);
  const { from, to, dep, journey, cancelled, dayStart, loading, error, stops, status, text } = ride;
  const { name, lineColorOf, platform } = ride;
  useAlightBuzz(status);

  // 同一时间只有一趟 GO：另有一趟还没坐完时，先问改乘这趟还是回到那一趟，不直接顶掉。
  const href = `/trip/go?${params}`;
  const active = useActiveRide();
  const conflict = !!active && rideKey(active.href) !== rideKey(href);
  // 找到方案、没有冲突时记下这一趟（预计到达后再留 15 分钟），重开 App 能回来；晚点了跟着往后挪。
  const arrival = journey ? dayStart + journey.live.arrival * 1000 : undefined;
  const until = arrival !== undefined ? arrival + 15 * 60_000 : undefined;
  useEffect(() => {
    if (arrival !== undefined && until !== undefined && !conflict) {
      startRide({ href, arrival, until });
    }
  }, [href, arrival, until, conflict]);
  const end = () => {
    endRide();
    navigate(`/trip/guide?${params}`, { replace: true });
  };

  return (
    <Page
      back="乘车 GO"
      backTo={`/trip/guide?${params}`}
      narrow
      // 另有一趟在乘车时先问清楚，标题不提前指挥这一趟（免得和下面的问题自相矛盾）。
      title={conflict ? "已在乘车中" : (text?.title ?? "—")}
      hero={!conflict && text && <p className={styles.detail}>{text.detail}</p>}
    >
      {/*
        读屏播报：大字提示每 5 秒重算（分钟数在变），只在换了一步时念一次——
        还有几站变了、下一站下车、换乘、到达。
      */}
      <p className={styles.announce} aria-live="polite">
        {!conflict && status && text
          ? status.kind === "ride" && status.stopsLeft > 1
            ? `还有 ${status.stopsLeft} 站`
            : text.title
          : ""}
      </p>
      {conflict && active ? (
        <RideConflict
          active={active}
          onReplace={() =>
            arrival !== undefined && until !== undefined && startRide({ href, arrival, until })
          }
        />
      ) : !from || !to || dep === undefined ? (
        <PanelMessage>没有选好行程，回到行程方案选一班。</PanelMessage>
      ) : !journey || !status ? (
        <PanelMessage>
          {loading
            ? "正在读取时刻表…"
            : error
              ? "时刻表暂时读不到，稍后再试。"
              : cancelled
                ? "这班车已经取消，回到行程方案重新选一班。"
                : "找不到这个班次（时刻表可能有变），回到行程方案重新选一班。"}
        </PanelMessage>
      ) : (
        <>
          <Progress
            journey={journey}
            status={status}
            lineColor={lineColorOf}
            isLive={ride.isLive}
          />
          <div className={styles.tools}>
            <TicketShortcut
              journey={journey}
              route={{ from, to }}
              date={params.get("date")}
              dayStart={dayStart}
            />
            <AlightReminders
              href={href}
              journey={journey}
              stops={stops}
              status={status}
              dayStart={dayStart}
              name={name}
              platform={platform}
            />
          </div>
          {(status.kind === "ride" || status.kind === "wait") && (
            <LegDiagram
              leg={journey.legs[status.legIndex]!}
              stops={stops[status.legIndex] ?? []}
              boarded={status.kind === "ride"}
              name={name}
              lineColor={lineColorOf}
            />
          )}
          {status.kind !== "arrived" && (
            <Group title="接下来">
              {journey.legs.slice(status.legIndex).map((leg, i) => (
                <li key={status.legIndex + i} className={styles.leg}>
                  <LegRow leg={leg} name={name} platform={platform} lineColor={lineColorOf} />
                </li>
              ))}
            </Group>
          )}
          <button type="button" className={styles.end} onClick={end}>
            {status.kind === "arrived" ? "完成" : "结束乘车"}
          </button>
        </>
      )}
    </Page>
  );
}

/** 整趟进度：各段按预计时长分段（乘车用线路色，步行是虚线），一个圆点标出现在走到哪。 */
function Progress({
  journey,
  status,
  lineColor,
  isLive,
}: {
  journey: LiveJourney;
  status: RideStatus;
  lineColor: (lineCode: string, operatorCode?: string) => string;
  /** 此刻这一段有实时列车位置；没有时是按时刻表推算的，写出来让人知道准不准。 */
  isLive: boolean;
}) {
  return (
    <div className={styles.progress}>
      <div
        className={styles.bar}
        role="img"
        aria-label={`已走 ${Math.round(status.progress * 100)}%`}
      >
        {/* 枢纽里换另一家（站内换乘）同同站换乘，不单独画一截虚线。 */}
        {journey.legs.map((leg, i) =>
          leg.kind === "walk" && leg.inStation ? null : (
            <span
              key={i}
              className={leg.kind === "walk" ? styles.walkSegment : styles.segment}
              style={
                {
                  flexGrow: Math.max(1, leg.live.arrival - leg.live.departure),
                  "--line":
                    leg.kind === "ride" ? lineColor(leg.lineCode, leg.operatorCode) : undefined,
                } as CSSProperties
              }
            />
          ),
        )}
        <span className={styles.marker} style={{ left: `${status.progress * 100}%` }} />
      </div>
      <p className={`${styles.ends} num`}>
        <span>{clockOf(journey.live.departure)}</span>
        {status.kind !== "arrived" && (
          <span className={isLive ? styles.live : undefined}>
            {isLive ? "实时位置" : "按时刻表推算"}
          </span>
        )}
        <span>{clockOf(journey.live.arrival)}</span>
      </p>
    </div>
  );
}

/** 本段各站收起与否：每人自己的偏好，存在这台设备上（读不到就展开）。 */
const collapseKey = "trainlink.goStopsCollapsed";

function useCollapsed(): [boolean, (value: boolean) => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(collapseKey) === "1";
    } catch {
      return false;
    }
  });
  const set = (value: boolean) => {
    setCollapsed(value);
    try {
      localStorage.setItem(collapseKey, value ? "1" : "0");
    } catch {
      // 存不下就只在这次打开时有效。
    }
  };
  return [collapsed, set];
}

/**
 * 这一段的各站，画法同列车详情的停靠站（见 StopList）：上车站在最上面、下车站在最下面（粗环），
 * 右边是预计时刻。列车开过的那截线变灰；列车停在站上时站点圆填深色、写「停靠中」，
 * 行驶中在刚开过的站与前方的站之间插一行 ▼。还没上车时标出上车站。
 * 可以收起：只留上车站（还没上车时）、刚开过的站、列车停着或前方的站与下车站，跳过的站收成虚线一段。
 */
function LegDiagram({
  leg,
  stops,
  boarded,
  name,
  lineColor,
}: {
  leg: LiveLeg;
  /** 这一段的各站（上车站在前，见 ride.ts）。 */
  stops: RideStop[];
  /** 已经上车（列车开出上车站了）。 */
  boarded: boolean;
  name: (code: string) => string;
  lineColor: (lineCode: string, operatorCode?: string) => string;
}) {
  const [collapsed, setCollapsed] = useCollapsed();
  if (leg.kind !== "ride" || stops.length < 2) return null;
  // 第一个列车还没开过的站：它正停着，或列车正开往它。
  const next = stops.findIndex((s) => !s.passed);
  const last = stops.length - 1;
  const folded = collapsedStops({ count: stops.length, next, boarded });
  // 只有中间有站可收时才给收起按钮。
  const collapsible = folded.some((item) => item.kind === "gap");
  const items: CollapsedItem[] = collapsed
    ? folded
    : stops.map((_, index) => ({ kind: "row" as const, index }));
  const moving = boarded && next > 0 && !stops[next]!.dwelling;

  return (
    <Group
      title="本段各站"
      count={last}
      action={
        collapsible && (
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? "展开" : "收起"}
          </button>
        )
      }
    >
      <li className={styles.diagram}>
        <StopList
          style={{ "--line": lineColor(leg.lineCode, leg.operatorCode) } as CSSProperties}
          label={`${leg.lineCode} 往 ${leg.headsign}，${name(leg.from)} 到 ${name(leg.to)}`}
        >
          {items.map((item, k) => {
            if (item.kind === "gap") {
              // 跳过的几站：后面紧跟的那一站之前的站都开过了，这一段就是灰的。
              const after = items[k + 1];
              const passed = after?.kind === "row" && !!stops[after.index - 1]?.passed;
              return (
                <GapRow
                  key={`gap-${k}`}
                  label={`展开另 ${item.count} 站`}
                  passed={passed}
                  onExpand={() => setCollapsed(false)}
                />
              );
            }
            const i = item.index;
            const stop = stops[i]!;
            return (
              <Fragment key={`${stop.station}-${i}`}>
                {moving && i === next && <TrainRow label="列车当前位置" />}
                <StopRow
                  name={name(stop.station)}
                  tags={
                    <>
                      {i === 0 && !boarded && <StopTag>上车</StopTag>}
                      {i === last && <StopTag tone="exit">下车</StopTag>}
                      {stop.dwelling && <StopStatus>{i === 0 ? "已进站" : "停靠中"}</StopStatus>}
                    </>
                  }
                  time={
                    stop.passed && i < last
                      ? "已发车"
                      : clockOf(i === 0 || stop.dwelling ? stop.departure : stop.arrival)
                  }
                  passed={stop.passed}
                  emphasis={i === last ? "here" : undefined}
                  dwell={stop.dwelling}
                  first={i === 0}
                  last={i === last}
                  current={stop.dwelling ? "location" : i === next ? "step" : undefined}
                />
              </Fragment>
            );
          })}
        </StopList>
      </li>
    </Group>
  );
}

/**
 * 另有一趟 GO 还没坐完时打开了这一趟：同一时间只跟一趟，先问清楚。
 * 改乘这趟就换掉原来的；回到当前乘车就去原来那一趟的 GO。
 */
function RideConflict({ active, onReplace }: { active: ActiveRide; onReplace: () => void }) {
  const home = useHomeStation();
  const catalog = useCatalog();
  const navigate = useNavigate();
  const params = new URLSearchParams(active.href.split("?")[1] ?? "");
  const end = (param: string) => {
    const ref = stationFromParam(params.get(param), home.serverId);
    return ref ? stationName(catalog.data, home.serverId, stationParam(ref)) : "—";
  };
  return (
    <div className={styles.conflict}>
      <p className={styles.conflictText}>
        你正在乘车：{end("from")} → {end("to")}。同一时间只能跟一趟，要改成这一趟吗？
      </p>
      <button type="button" className={styles.replace} onClick={onReplace}>
        改乘这一趟
      </button>
      <button
        type="button"
        className={styles.back}
        onClick={() => navigate(active.href, { replace: true })}
      >
        回到当前乘车
      </button>
    </div>
  );
}

/** 接下来的一段：乘车写线路、方向和起止；步行写走多久。 */
function LegRow({
  leg,
  name,
  platform,
  lineColor,
}: {
  leg: LiveLeg;
  name: (key: string) => string;
  platform: (leg: { from: string; platform?: string }) => string | undefined;
  lineColor: (lineCode: string, operatorCode?: string) => string;
}) {
  // 枢纽里换另一家运营方：同乘坐指南的同站换乘，用换乘图标，不画成步行。
  if (leg.kind === "walk" && leg.inStation) {
    return (
      <>
        <TransferIcon className={styles.walkIcon} aria-hidden />
        <span className={styles.legMain}>
          站内换乘
          <span className={styles.legMeta}>约 {Math.ceil(leg.seconds / 60)} 分钟</span>
        </span>
      </>
    );
  }
  if (leg.kind === "walk") {
    return (
      <>
        <WalkIcon className={styles.walkIcon} aria-hidden />
        <span className={styles.legMain}>
          步行到 {name(leg.to)}
          <span className={styles.legMeta}>约 {Math.ceil(leg.seconds / 60)} 分钟</span>
        </span>
      </>
    );
  }
  return (
    <>
      <ServiceBadge
        lineCode={leg.lineCode}
        lineColor={lineColor(leg.lineCode, leg.operatorCode)}
        size="s"
      />
      <span className={styles.legMain}>
        往 {leg.headsign}
        <span className={`${styles.legMeta} num`}>
          {clockOf(leg.live.departure)} {name(leg.from)}
          {leg.platform ? ` ${platform(leg)}` : ""} → {clockOf(leg.live.arrival)} {name(leg.to)}
        </span>
      </span>
    </>
  );
}

/**
 * 车票：这段区间（起终点）有能用的票就「出示车票」——从底部伸出车票卡片（大二维码、模拟进出站），
 * 不离开 GO；没有就「取票」——出一张区间票（记下这趟方案），打开车票页，进站后自动回到这趟的乘车 GO。
 */
function TicketShortcut({
  journey,
  route,
  date,
  dayStart,
}: {
  journey: LiveJourney;
  route: TripRoute;
  /** 运营日（"2026-10-31"），同车票上记下的方案；地址里没写时为 null。 */
  date: string | null;
  dayStart: number;
}) {
  const tickets = useTickets();
  const issueTicket = useIssueTicket();
  const catalog = useCatalog();
  // 枢纽算同一站：从另一家的成员站出的票也能用。
  const same = (a: HomeStation, b: HomeStation) => sameHub(catalog.data, a, b);
  // 面板打开时记住是哪张票：在面板里出站后它就不再「能用」，但面板要留着显示闸机结果，不能一下子消失。
  // 关上时只收起、不忘记是哪张，面板才有往下收的动画。
  const [sheet, setSheet] = useState<{ id: string; open: boolean }>();
  const departsAt = dayStart + journey.live.departure * 1000;
  const usable = ticketFor(tickets, route, departsAt, same);
  // 这一趟已经出过站的票：行程走完了，给「查看车票」，不再让人取一张新的。
  const used = usable
    ? undefined
    : usedTicketFor(
        tickets,
        route,
        {
          date,
          departure: journey.departure,
          tripId: journey.legs.find((l) => l.kind === "ride")?.tripId,
        },
        dayStart,
        same,
      );
  const ticket = usable ?? used;
  const shown = sheet && tickets.find((t) => t.id === sheet.id);

  return (
    <>
      {ticket ? (
        <button
          type="button"
          className={styles.tool}
          onClick={() => setSheet({ id: ticket.id, open: true })}
        >
          <TicketIcon aria-hidden />
          {usable ? "出示车票" : "查看车票"}
        </button>
      ) : (
        <button
          type="button"
          className={styles.tool}
          onClick={() => issueTicket(route, journey, dayStart)}
        >
          <TicketIcon aria-hidden />
          取票
        </button>
      )}
      {sheet && shown && (
        <TicketSheet
          ticket={shown}
          open={sheet.open}
          onClose={() => setSheet({ ...sheet, open: false })}
        />
      )}
    </>
  );
}

/**
 * 下车提醒：每段乘车在前一站开出时提醒「下一站下车」（换乘写清楚换哪班车）。
 * 用系统通知（需要 TrainLink 开着，见 reminders.ts）；还没坐完的段都设上，关掉时一起取消。
 */
function AlightReminders({
  href,
  journey,
  stops,
  status,
  dayStart,
  name,
  platform,
}: {
  /** 这趟 GO 的地址：提醒按它分组，结束或改乘时一起取消（见 rideStore.ts）。 */
  href: string;
  journey: LiveJourney;
  stops: RideStop[][];
  status: RideStatus;
  dayStart: number;
  name: (key: string) => string;
  platform: (leg: { from: string; platform?: string }) => string | undefined;
}) {
  const keyBase = rideReminderPrefix(href);
  // 还没坐完的各段：在哪一刻提醒、提醒写什么。时刻跟着实时数据变（晚点了就往后挪）。
  const schedule = journey.legs.flatMap((leg, legIndex) => {
    if (leg.kind !== "ride" || status.kind === "arrived" || legIndex < status.legIndex) return [];
    const text = rideText(
      { kind: "ride", legIndex, stopsLeft: 1, nextStop: leg.to, arrivesIn: 0, progress: 0 },
      journey,
      name,
      platform,
    );
    return [
      {
        key: `${keyBase}-${legIndex}`,
        fireAt: dayStart + alightReminderAt(stops[legIndex] ?? [], leg) * 1000,
        ...text,
      },
    ];
  });
  const keys = schedule.map((s) => s.key);
  const on = useAnyReminder(keys);
  const [note, setNote] = useState<string>();

  const arm = async () => {
    let result: ReminderResult = "past";
    for (const s of schedule) {
      const r = await setReminder(s.key, s.fireAt, s.title, s.detail);
      if (r === "set" || result === "past") result = r;
    }
    return result;
  };

  // 开着提醒时，预计时刻变了（晚点、早到）就按新时刻重新设；同一个 key 会替换掉原来的定时。
  const timing = schedule.map((s) => s.fireAt).join(",");
  const armRef = useRef(arm);
  armRef.current = arm;
  useEffect(() => {
    if (on) void armRef.current();
    // 只在时刻变了时重设（on 打开那一下由 toggle 自己设）。
  }, [timing]);

  const toggle = async () => {
    if (on) {
      keys.forEach(clearReminder);
      setNote(undefined);
      return;
    }
    setNote(
      {
        set: "前一站开出时提醒你下车（需保持 TrainLink 打开）",
        denied: "没有通知权限，可在浏览器设置里允许通知",
        unsupported: "这个浏览器不支持网页提醒",
        past: "已经过了提醒的时候",
      }[await arm()],
    );
  };

  if (schedule.length === 0) return null;
  return (
    <>
      <button type="button" className={styles.tool} aria-pressed={on} onClick={toggle}>
        {on ? <BellOnIcon aria-hidden /> : <BellIcon aria-hidden />}
        {on ? "已开下车提醒" : "下车提醒"}
      </button>
      {note && <p className={styles.note}>{note}</p>}
    </>
  );
}

/**
 * 开着 GO 页面时，前一站开车（下一站就下车）的那一刻振动一下，与下车提醒同一时刻；每段只振一次。
 * 列车还停在前一站时不振。打开页面（或刷新）时已经是这个状态的不振：那不是刚发生的。
 */
function useAlightBuzz(status: RideStatus | undefined) {
  const buzzed = useRef(new Set<string>());
  const seen = useRef(false);
  const key =
    status?.kind === "ride" && status.stopsLeft === 1 && !status.dwellingAt
      ? `alight-${status.legIndex}`
      : undefined;
  useEffect(() => {
    if (!status) return;
    const first = !seen.current;
    seen.current = true;
    if (!key || buzzed.current.has(key)) return;
    buzzed.current.add(key);
    if (first) return;
    try {
      navigator.vibrate?.([120, 80, 120]);
    } catch {
      // 不支持振动就算了。
    }
  }, [key, status]);
}
