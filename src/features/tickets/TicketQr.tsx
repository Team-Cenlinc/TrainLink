import type { Ref } from "react";
import { AnimatePresence, motion } from "motion/react";
import { QrCode } from "./QrCode.tsx";
import { qrPayload, qrWindowMs, ticketState, type Ticket, type TicketState } from "./ticket.ts";
import { stateLabel } from "./ticketText.ts";
import styles from "./TicketPage.module.css";

/**
 * 车票的动态二维码：每 30 秒换码（新码叠在旧码上淡入，旧码淡出）；
 * 用过或失效的票二维码变淡，盖一个状态章。车票页的票根与乘车 GO 的车票卡片共用。
 * @param now 现在（毫秒），由调用方每秒更新
 */
export function TicketQr({
  ticket,
  now,
  className,
  ref,
}: {
  ticket: Ticket;
  now: number;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}) {
  const state = ticketState(ticket, now);
  const live = state === "unused" || state === "entered";
  const qrWindow = Math.floor(now / qrWindowMs);
  return (
    <div ref={ref} className={`${styles.qr} ${live ? "" : styles.qrOff} ${className ?? ""}`}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={qrWindow}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <QrCode value={qrPayload(ticket, now)} label={`车票二维码，${stateLabel[state]}`} />
        </motion.div>
      </AnimatePresence>
      {!live && <span className={styles.qrStamp}>{stateLabel[state]}</span>}
    </div>
  );
}

/** 刷新倒计时：一条细条从满到空，下面写还有几秒换码。 */
export function QrCountdown({ now }: { now: number }) {
  const left = 1 - (now % qrWindowMs) / qrWindowMs;
  return (
    <>
      <span className={styles.countdown} aria-hidden>
        <span key={Math.floor(now / qrWindowMs)} style={{ transform: `scaleX(${left})` }} />
      </span>
      <p className="num">{Math.ceil((left * qrWindowMs) / 1000)} 秒后刷新</p>
    </>
  );
}

/** 状态标签；pop 时以小弹簧弹出（状态刚变化）。 */
export function StateTag({ state, pop }: { state: TicketState; pop: boolean }) {
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
