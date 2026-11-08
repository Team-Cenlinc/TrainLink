import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Page, PanelMessage } from "@/components/Page.tsx";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import { fallbackLineColor } from "@/lib/lineColor.ts";
import { hubKeys, sameHub } from "@/lib/hubs.ts";
import { useCatalog, useNow } from "@/lib/queries.ts";
import { sourceTimeZone } from "@/lib/railApi.ts";
import { formatClock } from "@/lib/time.ts";
import { minutesBetween } from "@/features/trip/journeyText.ts";
import { lineOf, stationInfo } from "@/features/trip/stations.ts";
import { useActiveRide } from "@/features/trip/rideStore.ts";
import { clockOf, dayStartOf } from "@/features/trip/serviceDay.ts";
import { journeyHref, stationFromParam, stationParam } from "@/features/trip/tripStore.ts";
import { useJourneys } from "@/features/trip/useJourneys.ts";
import { fitQrSize } from "./fitQr.ts";
import { QrCountdown, StateTag, TicketQr } from "./TicketQr.tsx";
import { sawtooth } from "./sawtooth.ts";
import { enterGate, exitGate, ticketStation, ticketState } from "./ticket.ts";
import { playPrint, playPunch, playTear, type TicketParts } from "./ticketMotion.ts";
import { refusalText, ticketIssuer } from "./ticketText.ts";
import { updateTicket, useTickets } from "./ticketStore.ts";
import styles from "./TicketPage.module.css";

/**
 * 一张仿真车票（v06 Mobile 09 + TrainTime 的二维码数字票）：线路色带、起终点与时刻，
 * 撕线下面是每 30 秒刷新的动态二维码票根；在起点「模拟进站」、在终点「模拟出站」。
 * 不接入任何真实系统，票面写明「仿真车票 · 不可乘车」。
 *
 * 实物动作（见 ticketMotion.ts）：刚出的票从出票口步进送出；进站时检票钳打孔，
 * 压到底的一刻才记为已入站；出站时沿撕线撕下票根，票根落下后才记为已出站。
 * 闸机规则（ticket.ts）在动画之前判断，被拒绝时不播动作，只写原因。
 */
export function TicketPage() {
  const { id } = useParams();
  // 按票号重新挂载：从一张票直接换到另一张时，闸机结果、出票动画等状态不沿用上一张的。
  return <TicketView key={id} id={id} />;
}

function TicketView({ id }: { id?: string }) {
  const ticket = useTickets().find((t) => t.id === id);
  const catalog = useCatalog();
  const now = useNow(1000);
  const reduce = useReducedMotion() ?? false;
  const location = useLocation();
  const navigate = useNavigate();
  // 进站后接着乘车 GO 用：正在进行的那一趟，以及这段区间接下来最近的一班。
  const activeRide = useActiveRide();
  const nextTrip = useJourneys(ticket?.from, ticket?.to, {}, 1);
  const [gate, setGate] = useState<{ text: string; ok: boolean }>();
  const [busy, setBusy] = useState(false);
  // 打开页面时的状态：之后变了（进站、出站）才让状态标签弹一下。
  const [openedState] = useState(() => ticket && ticketState(ticket, Date.now()));
  // 从「车票」按钮刚出的票才播出票动画；播一次后清掉标记，刷新或返回再来都不再播。
  const [fresh] = useState(() => Boolean((location.state as { fresh?: boolean } | null)?.fresh));
  // 出票动画进行中：票先藏在出票口上方，出票台裁在出票口那一行。
  const [printing, setPrinting] = useState(fresh && !reduce);

  // 开发模式的严格模式会把挂载时的副作用跑两遍：出票动画只播第一遍。
  const printed = useRef(false);
  const status = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const lip = useRef<HTMLSpanElement>(null);
  const article = useRef<HTMLElement>(null);
  const jolt = useRef<HTMLDivElement>(null);
  const hole = useRef<HTMLSpanElement>(null);
  const stub = useRef<HTMLDivElement>(null);
  const teeth = useRef<HTMLSpanElement>(null);
  const jaw = useRef<HTMLSpanElement>(null);
  const chad = useRef<HTMLSpanElement>(null);
  const qrBox = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const seam = useRef<HTMLSpanElement>(null);
  const tearLine = useRef<HTMLSpanElement>(null);
  // 车票稍后才出现时（另一个标签页刚出的票），票面这时才挂上，两个布局钩子要再跑一次。
  const shown = !!ticket;
  useFitQr(stage, qrBox, shown);
  useSawtooth(body, teeth, [seam, tearLine], shown);
  const parts = (): TicketParts | undefined =>
    stage.current &&
    feed.current &&
    article.current &&
    jolt.current &&
    hole.current &&
    teeth.current &&
    jaw.current &&
    chad.current
      ? {
          stage: stage.current,
          lip: lip.current,
          feed: feed.current,
          ticket: article.current,
          jolt: jolt.current,
          hole: hole.current,
          stub: stub.current,
          tearLine: tearLine.current,
          teeth: teeth.current,
          jaw: jaw.current,
          chad: chad.current,
        }
      : undefined;

  useEffect(() => {
    if (!fresh || printed.current) return;
    printed.current = true;
    navigate(location.pathname, { replace: true, state: null });
    const p = parts();
    if (!p) return;
    setBusy(true);
    void playPrint(p, reduce).finally(() => {
      setBusy(false);
      setPrinting(false);
    });
    // 只在第一次打开时播一次（依赖留空是有意的）。
  }, []);

  if (!ticket) {
    return (
      <Page back="车票" title="找不到这张票">
        <PanelMessage>票夹里没有这张票。票夹只保留最近的 50 张。</PanelMessage>
      </Page>
    );
  }

  // 车站 key（或旧票闸机记录里的站码）→ 站名；枢纽显示枢纽名。
  const name = (station: string) => stationInfo(catalog.data, ticketStation(ticket, station)).name;
  const timeZone = sourceTimeZone(catalog.data, ticket.from.serverId);
  const state = ticketState(ticket, now);
  const live = state === "unused" || state === "entered";
  const lines = ticket.lineCodes.map((code) => lineOf(catalog.data, ticket.from.serverId, code));
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone }).format(
    ticket.validUntil - 16 * 3600_000,
  );
  // 票头写坐的线路属于哪几家（跨两家是联运票），见 ticketText.ts 的 ticketIssuer。
  const issuer = ticketIssuer(catalog.data, ticket);
  /*
   * 进站后接着乘车 GO 跟哪一班（区间票哪一班都能坐）：
   * 1. 已经在跟这段区间的一趟 GO，就是它；
   * 2. 出票时选的那班（ticket.ride）还没开走（留 1 分钟），就是它；
   * 3. 否则这段区间接下来最近的一班（错过了原来那班、坐下一班的情况）。
   */
  const activeParams = activeRide && new URLSearchParams(activeRide.href.split("?")[1] ?? "");
  // 枢纽算同一站：GO 从另一家的成员站查的也是这段区间。
  const activeFrom = stationFromParam(activeParams?.get("from") ?? null, ticket.from.serverId);
  const activeTo = stationFromParam(activeParams?.get("to") ?? null, ticket.from.serverId);
  const activeHref =
    activeFrom &&
    activeTo &&
    sameHub(catalog.data, activeFrom, ticket.from) &&
    sameHub(catalog.data, activeTo, ticket.to)
      ? activeRide?.href
      : undefined;
  const rideDeparture = ticket.ride?.departure ?? ticket.departure;
  const rideDayStart = ticket.ride && dayStartOf(ticket.ride.date, timeZone);
  const rideLeft =
    rideDayStart !== undefined &&
    rideDeparture !== undefined &&
    rideDayStart + rideDeparture * 1000 < now - 60_000;
  const rideHref =
    ticket.ride &&
    rideDeparture !== undefined &&
    journeyHref("go", ticket, {
      date: ticket.ride.date,
      departure: rideDeparture,
      tripId: ticket.ride.tripId,
    });
  const next = nextTrip.journeys?.[0];
  const nextHref =
    next &&
    journeyHref("go", ticket, {
      date: nextTrip.date,
      departure: next.departure,
      tripId: next.legs.find((l) => l.kind === "ride")?.tripId,
    });
  const goHref = activeHref ?? (rideHref && !rideLeft ? rideHref : (nextHref ?? rideHref));
  const opened = (text: string) =>
    setGate({ ok: true, text: `闸机已打开：${formatClock(Date.now(), timeZone)} ${text}` });

  const enter = async () => {
    if (busy) return;
    const result = enterGate(
      ticket,
      stationParam(ticket.from),
      Date.now(),
      hubKeys(catalog.data, ticket.from),
    );
    const p = parts();
    if (!result.ok || !p) {
      if (!result.ok) setGate({ ok: false, text: `闸机未打开：${refusalText[result.reason]}` });
      return;
    }
    setBusy(true);
    await playPunch(p, reduce, () => {
      updateTicket(result.ticket);
      opened(`${name(stationParam(ticket.from))}进站`);
    });
    setBusy(false);
    // 进了站就是要坐车了：让「闸机已打开」停一下，直接进入乘车 GO（返回能回到这张票）。
    if (goHref) {
      await new Promise((resolve) => setTimeout(resolve, reduce ? 300 : 700));
      navigate(goHref);
    }
  };

  const exit = async () => {
    if (busy) return;
    const result = exitGate(
      ticket,
      stationParam(ticket.to),
      Date.now(),
      hubKeys(catalog.data, ticket.to),
    );
    const p = parts();
    if (!result.ok || !p) {
      if (!result.ok) setGate({ ok: false, text: `闸机未打开：${refusalText[result.reason]}` });
      return;
    }
    setBusy(true);
    await playTear(p, reduce);
    updateTicket(result.ticket);
    opened(`${name(stationParam(ticket.to))}出站`);
    setBusy(false);
    // 出站后按钮没有了，焦点移到闸机结果上，不掉回页面开头。
    status.current?.focus({ preventScroll: true });
  };

  return (
    <Page
      back="车票"
      narrow
      title={
        <>
          {name(stationParam(ticket.from))}
          <span className={styles.arrow}>→</span>
          {name(stationParam(ticket.to))}
        </>
      }
      hero={
        <p className={styles.heroMeta}>
          <StateTag state={state} pop={state !== openedState && !reduce} />
          有效期至 {formatClock(ticket.validUntil, timeZone)}（次日）
        </p>
      }
    >
      <div ref={stage} className={styles.stage}>
        {/*
          出票口的唇边：与面板同色、往下渐隐的一条。票的前沿（深色外框）从它下面滑出来、慢慢显现，
          不会凭空冒出一道黑线。送完淡出，出票动画结束后拿掉。
        */}
        {printing && <span ref={lip} className={styles.lip} aria-hidden />}
        <div ref={feed} className={`${styles.feed} ${printing ? styles.feeding : ""}`}>
          <div ref={jolt}>
            {/* 刚出的票先停在出票口上方，送纸动画把它推下来（送完停在原位）。 */}
            <article
              ref={article}
              className={`${styles.ticket} ${printing ? styles.unprinted : ""}`}
              aria-label="仿真车票"
            >
              <div className={styles.bodyWrap}>
                <div ref={body} className={styles.body}>
                  <div className={styles.band} aria-hidden>
                    {lines.map((line, i) => (
                      <span
                        key={i}
                        style={{ "--line": line?.color ?? fallbackLineColor } as CSSProperties}
                      />
                    ))}
                  </div>
                  <div className={styles.face}>
                    <p className={styles.brand}>
                      {issuer.name} <span>{issuer.through ? "联运 · 仿真车票" : "仿真车票"}</span>
                    </p>
                    <p className={styles.route}>
                      {name(stationParam(ticket.from))}
                      <span className={styles.arrow}>→</span>
                      {name(stationParam(ticket.to))}
                    </p>
                    {/* 区间票不绑定班次，写「当日有效」；旧版本按班次出的票照旧写起止时刻。 */}
                    {ticket.departure !== undefined && ticket.arrival !== undefined ? (
                      <>
                        <p className={`${styles.times} num`}>
                          {clockOf(ticket.departure)} <span className={styles.dash}>—</span>{" "}
                          {clockOf(ticket.arrival)}
                        </p>
                        <p className={styles.meta}>
                          <span className="num">{date}</span> ·{" "}
                          {minutesBetween(ticket.departure, ticket.arrival)} 分
                        </p>
                      </>
                    ) : (
                      <>
                        <p className={styles.times}>当日有效</p>
                        <p className={styles.meta}>
                          <span className="num">{date}</span> · 任意班次
                        </p>
                      </>
                    )}
                    <p className={styles.badges}>
                      {lines.map(
                        (line, i) =>
                          line && (
                            <ServiceBadge
                              key={i}
                              lineCode={line.code}
                              lineColor={line.color}
                              size="s"
                            />
                          ),
                      )}
                    </p>
                    {/* 打孔位置一直在，进站后才看得见；检票钳按它定位。 */}
                    <span
                      ref={hole}
                      className={`${styles.hole} ${ticket.entry ? "" : styles.hidden}`}
                      aria-hidden
                    />
                  </div>
                  <footer className={styles.foot}>
                    <span className="num">{ticket.id}</span>
                    <span>仿真车票 · 不可乘车</span>
                  </footer>
                </div>
                {/* 撕开后票身下沿的锯齿（与面板底色相同的一排三角）。 */}
                {/* 没撕时的撕线：票脚下沿一排白齿（票根的纸），撕的时候从裂口往右换成上面的锯齿。 */}
                {!ticket.exit && <span ref={tearLine} className={styles.tearLine} aria-hidden />}
                <span
                  ref={teeth}
                  className={`${styles.teeth} ${ticket.exit ? "" : styles.hidden}`}
                  aria-hidden
                />
              </div>

              {!ticket.exit && (
                <div ref={stub} className={styles.stub}>
                  {/* 票根顶边向上的齿，与票身的锯齿咬合成撕线（见样式说明）。 */}
                  <span ref={seam} className={styles.stubSeam} aria-hidden />
                  <TicketQr ref={qrBox} ticket={ticket} now={now} />
                  <div className={styles.qrText}>
                    <StateTag state={state} pop={state !== openedState && !reduce} />
                    {live ? (
                      <>
                        <p>二维码每 30 秒刷新，截图无效。</p>
                        <QrCountdown now={now} />
                      </>
                    ) : (
                      <p>这张票已经不能再进出闸机。</p>
                    )}
                  </div>
                </div>
              )}
            </article>
          </div>
        </div>
        <span ref={jaw} className={styles.jaw} aria-hidden />
        <span ref={chad} className={styles.chad} aria-hidden />
      </div>

      <div className={styles.gate}>
        {/* 进站、出站是同一个按钮换文字：进站后焦点留在按钮上。出站后按钮收起，下面的内容不跳。 */}
        {/*
          闸机按钮一行：进站、出站是同一个按钮换文字（进站后焦点留在按钮上）；已入站时旁边多一个 GO，
          接着乘车 GO。出站后整行一起收起，下面的内容不跳。
        */}
        <AnimatePresence initial={false}>
          {live && (
            <motion.div
              key="gate"
              className={styles.gateRow}
              exit={{ opacity: 0, height: 0, marginBottom: -10 }}
              transition={reduce ? { duration: 0 } : { duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            >
              <button
                type="button"
                className={styles.gateButton}
                aria-disabled={busy}
                onClick={state === "unused" ? enter : exit}
              >
                {state === "unused"
                  ? `模拟进站 · ${name(stationParam(ticket.from))}`
                  : `模拟出站 · ${name(stationParam(ticket.to))}`}
              </button>
              {state === "entered" && goHref && (
                <Link className={styles.goButton} to={goHref} aria-label="乘车 GO">
                  GO
                </Link>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={status} className={styles.status} role="status" tabIndex={-1}>
          {/* 结果展开出现（高度从 0 起），与上面收起的按钮同时进行，下面的内容不会先被顶下去再拉上来。 */}
          <AnimatePresence initial={false}>
            {gate && (
              <motion.div
                key="result"
                className={styles.gateResultWrap}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                transition={reduce ? { duration: 0 } : { duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              >
                <p
                  className={`${styles.gateResult} ${gate.ok ? styles.gateOk : styles.gateRefused}`}
                >
                  {gate.text}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {ticket.entry && (
          <p className={styles.record}>
            进站 {formatClock(ticket.entry.at, timeZone)} {name(ticket.entry.station)}
            {ticket.exit &&
              ` · 出站 ${formatClock(ticket.exit.at, timeZone)} ${name(ticket.exit.station)}`}
          </p>
        )}
      </div>
    </Page>
  );
}

/**
 * 撕线各排齿的形状（clip-path，见 sawtooth.ts）：按票身内框宽度取整齿数。
 * 白齿（票身下沿的撕线、票根顶边）在外框以内；撕开后的锯齿连两侧外框一起盖，
 * 齿往里错开外框宽度。各排齿位置一致，咬合成撕线。
 */
function useSawtooth(
  body: RefObject<HTMLDivElement | null>,
  teeth: RefObject<HTMLSpanElement | null>,
  seams: RefObject<HTMLSpanElement | null>[],
  shown: boolean,
) {
  useLayoutEffect(() => {
    const bodyEl = body.current;
    if (!bodyEl) return;
    const shape = () => {
      const width = bodyEl.clientWidth;
      const inset = parseFloat(getComputedStyle(bodyEl).borderLeftWidth);
      teeth.current?.style.setProperty(
        "clip-path",
        sawtooth({ width, height: 9, valley: 8, inset }),
      );
      const seam = sawtooth({ width, height: 8 });
      for (const ref of seams) ref.current?.style.setProperty("clip-path", seam);
    };
    shape();
    const observer = new ResizeObserver(shape);
    observer.observe(bodyEl);
    return () => observer.disconnect();
    // seams 数组每次渲染都是新的，里面的 ref 本身不变，不放进依赖。
  }, [body, teeth, shown]);
}

/**
 * 让整张票连同闸机按钮放进面板顶边到浮动标签栏之间：可伸缩的只有二维码，按富余或超出的高度调它的边长
 *（--qr-size，计算见 fitQr.ts）。只在整页固定的手机、平板布局上做（Page 的 data-fixed-page）；
 * 桌面是普通的文档滚动，用默认边长。窗口、字体、闸机按钮、进出站记录让高度变化时重算，
 * 自己改了边长引起的变化再算一次就稳定（富余为 0）。
 */
function useFitQr(
  stage: RefObject<HTMLDivElement | null>,
  qrBox: RefObject<HTMLDivElement | null>,
  shown: boolean,
) {
  useLayoutEffect(() => {
    const stageEl = stage.current;
    const content = stageEl?.parentElement;
    const page = stageEl?.closest<HTMLElement>("[data-fixed-page]");
    const panel = stageEl?.closest("main");
    if (!stageEl || !content || !page || !panel) return;
    const fit = () => {
      const qr = qrBox.current;
      if (!qr) return;
      // 票根正在动（撕下、落出画面）时不改：它原来占的位置收起会让页面以为有了富余，二维码在半空中变大。
      if (qr.parentElement?.getAnimations().length) return;
      // 内容底边停在面板底部留白（给标签栏等浮动的东西让的高度，--bottom-chrome）之上：
      // 内容加留白正好一屏，页面不会多滚一截。
      const limit = page.clientHeight - parseFloat(getComputedStyle(panel).paddingBottom);
      const size = fitQrSize({
        current: qr.offsetWidth,
        // 页面滚动过时按滚回顶部的位置算。
        spare: limit - (content.getBoundingClientRect().bottom + page.scrollTop),
        max: Math.min(window.innerWidth * 0.48, 200),
      });
      if (size !== qr.offsetWidth) stageEl.style.setProperty("--qr-size", `${size}px`);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(content);
    observer.observe(page);
    // 面板底部留白变了（「乘车中」迷你条出现或消失，见 --bottom-chrome）也要重算：
    // 留白不改内容的尺寸，要看面板的外框尺寸。
    observer.observe(panel, { box: "border-box" });
    return () => {
      observer.disconnect();
      stageEl.style.removeProperty("--qr-size");
    };
  }, [stage, qrBox, shown]);
}
