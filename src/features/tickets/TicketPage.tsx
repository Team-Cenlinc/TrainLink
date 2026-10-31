import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Page, PanelMessage } from "@/components/Page.tsx";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import { fallbackLineColor } from "@/lib/lineColor.ts";
import { useCatalog, useNow } from "@/lib/queries.ts";
import { sourceTimeZone } from "@/lib/railApi.ts";
import { formatClock } from "@/lib/time.ts";
import { minutesBetween } from "@/features/trip/journeyText.ts";
import { clockOf } from "@/features/trip/serviceDay.ts";
import { lineOf, stationInfo } from "@/features/trip/stations.ts";
import { QrCode } from "./QrCode.tsx";
import {
  enterGate,
  exitGate,
  qrPayload,
  qrWindowMs,
  ticketState,
  type TicketState,
} from "./ticket.ts";
import { playPrint, playPunch, playTear, type TicketParts } from "./ticketMotion.ts";
import { refusalText, stateLabel } from "./ticketText.ts";
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
  const slot = useRef<HTMLSpanElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const article = useRef<HTMLElement>(null);
  const jolt = useRef<HTMLDivElement>(null);
  const hole = useRef<HTMLSpanElement>(null);
  const stub = useRef<HTMLDivElement>(null);
  const teeth = useRef<HTMLSpanElement>(null);
  const jaw = useRef<HTMLSpanElement>(null);
  const chad = useRef<HTMLSpanElement>(null);
  const parts = (): TicketParts | undefined =>
    stage.current &&
    slot.current &&
    feed.current &&
    article.current &&
    jolt.current &&
    hole.current &&
    teeth.current &&
    jaw.current &&
    chad.current
      ? {
          stage: stage.current,
          slot: slot.current,
          feed: feed.current,
          ticket: article.current,
          jolt: jolt.current,
          hole: hole.current,
          stub: stub.current,
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

  const name = (code: string) =>
    stationInfo(catalog.data, { ...ticket.from, stationCode: code }).name;
  const timeZone = sourceTimeZone(catalog.data, ticket.from.serverId);
  const state = ticketState(ticket, now);
  const live = state === "unused" || state === "entered";
  const lines = ticket.lineCodes.map((code) => lineOf(catalog.data, ticket.from.serverId, code));
  // 距下一次刷新还有多少（0–1），画成二维码旁边一条逐渐缩短的进度条。
  const left = 1 - (now % qrWindowMs) / qrWindowMs;
  const qrWindow = Math.floor(now / qrWindowMs);
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone }).format(
    ticket.validUntil - 16 * 3600_000,
  );
  const opened = (text: string) =>
    setGate({ ok: true, text: `闸机已打开：${formatClock(Date.now(), timeZone)} ${text}` });

  const enter = async () => {
    if (busy) return;
    const result = enterGate(ticket, ticket.from.stationCode, Date.now());
    const p = parts();
    if (!result.ok || !p) {
      if (!result.ok) setGate({ ok: false, text: `闸机未打开：${refusalText[result.reason]}` });
      return;
    }
    setBusy(true);
    await playPunch(p, reduce, () => {
      updateTicket(result.ticket);
      opened(`${name(ticket.from.stationCode)}进站`);
    });
    setBusy(false);
  };

  const exit = async () => {
    if (busy) return;
    const result = exitGate(ticket, ticket.to.stationCode, Date.now());
    const p = parts();
    if (!result.ok || !p) {
      if (!result.ok) setGate({ ok: false, text: `闸机未打开：${refusalText[result.reason]}` });
      return;
    }
    setBusy(true);
    await playTear(p, reduce);
    updateTicket(result.ticket);
    opened(`${name(ticket.to.stationCode)}出站`);
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
          {name(ticket.from.stationCode)}
          <span className={styles.arrow}>→</span>
          {name(ticket.to.stationCode)}
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
        <span ref={slot} className={`${styles.slot} ${fresh ? "" : styles.hidden}`} aria-hidden />
        <div ref={feed} className={`${styles.feed} ${printing ? styles.feeding : ""}`}>
          <div ref={jolt}>
            {/* 刚出的票先停在出票口上方，送纸动画把它推下来（送完停在原位）。 */}
            <article
              ref={article}
              className={`${styles.ticket} ${printing ? styles.unprinted : ""}`}
              aria-label="仿真车票"
            >
              <div className={styles.bodyWrap}>
                <div className={styles.body}>
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
                      TrainLink <span>仿真车票</span>
                    </p>
                    <p className={styles.route}>
                      {name(ticket.from.stationCode)}
                      <span className={styles.arrow}>→</span>
                      {name(ticket.to.stationCode)}
                    </p>
                    <p className={`${styles.times} num`}>
                      {clockOf(ticket.departure)} <span className={styles.dash}>—</span>{" "}
                      {clockOf(ticket.arrival)}
                    </p>
                    <p className={styles.meta}>
                      <span className="num">{date}</span> ·{" "}
                      {minutesBetween(ticket.departure, ticket.arrival)} 分
                    </p>
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
                <span
                  ref={teeth}
                  className={`${styles.teeth} ${ticket.exit ? "" : styles.hidden}`}
                  aria-hidden
                />
              </div>

              {!ticket.exit && (
                <div ref={stub} className={styles.stub}>
                  {/* 票根顶边向上的齿，与票身的锯齿咬合成撕线（见样式说明）。 */}
                  <span className={styles.stubSeam} aria-hidden />
                  <div className={`${styles.qr} ${live ? "" : styles.qrOff}`}>
                    {/* 每 30 秒换码：新码叠在旧码上淡入，旧码淡出。 */}
                    <AnimatePresence initial={false} mode="popLayout">
                      <motion.div
                        key={qrWindow}
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                      >
                        <QrCode
                          value={qrPayload(ticket, now)}
                          label={`车票二维码，${stateLabel[state]}`}
                        />
                      </motion.div>
                    </AnimatePresence>
                    {!live && <span className={styles.qrStamp}>{stateLabel[state]}</span>}
                  </div>
                  <div className={styles.qrText}>
                    <StateTag state={state} pop={state !== openedState && !reduce} />
                    {live ? (
                      <>
                        <p>二维码每 30 秒刷新，截图无效。</p>
                        <span className={styles.countdown} aria-hidden>
                          <span key={qrWindow} style={{ transform: `scaleX(${left})` }} />
                        </span>
                        <p className="num">{Math.ceil((left * qrWindowMs) / 1000)} 秒后刷新</p>
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
        <AnimatePresence initial={false}>
          {live && (
            <motion.button
              key="gate"
              type="button"
              className={styles.gateButton}
              aria-disabled={busy}
              onClick={state === "unused" ? enter : exit}
              exit={{ opacity: 0, height: 0, marginBottom: -10 }}
              transition={reduce ? { duration: 0 } : { duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            >
              {state === "unused"
                ? `模拟进站 · ${name(ticket.from.stationCode)}`
                : `模拟出站 · ${name(ticket.to.stationCode)}`}
            </motion.button>
          )}
        </AnimatePresence>
        <div ref={status} className={styles.status} role="status" tabIndex={-1}>
          {gate && (
            <p className={`${styles.gateResult} ${gate.ok ? styles.gateOk : styles.gateRefused}`}>
              {gate.text}
            </p>
          )}
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

/** 状态标签；pop 时以小弹簧弹出（状态刚变化）。 */
function StateTag({ state, pop }: { state: TicketState; pop: boolean }) {
  return (
    <motion.span
      key={state}
      className={`${styles.state} ${styles[state]}`}
      initial={pop ? { scale: 0.6, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", bounce: 0.4, duration: 0.4 }}
    >
      {stateLabel[state]}
    </motion.span>
  );
}
