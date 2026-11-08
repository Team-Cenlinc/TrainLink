import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useReducedMotion } from "motion/react";
import CloseIcon from "@material-symbols/svg-400/outlined/close.svg?react";
import { Overlay } from "@/components/Overlay.tsx";
import { hubKeys } from "@/lib/hubs.ts";
import { useCatalog, useNow } from "@/lib/queries.ts";
import { sourceTimeZone } from "@/lib/railApi.ts";
import { formatClock } from "@/lib/time.ts";
import { clockOf } from "@/features/trip/serviceDay.ts";
import { stationInfo } from "@/features/trip/stations.ts";
import { stationParam } from "@/features/trip/tripStore.ts";
import { enterGate, exitGate, ticketStation, ticketState, type Ticket } from "./ticket.ts";
import { refusalText, ticketIssuer } from "./ticketText.ts";
import { QrCountdown, StateTag, TicketQr } from "./TicketQr.tsx";
import { updateTicket } from "./ticketStore.ts";
import styles from "./TicketSheet.module.css";

/**
 * 乘车 GO 里「出示车票」：从底部伸出的面板（与车站信息等面板一样，拖动条往下拖就收起），不离开 GO。
 * 大号动态二维码对着闸机扫，下面是刷新倒计时与模拟进出站；打开期间屏幕不自动熄灭。
 * 打孔、撕票根这些实物动画留在完整的车票页（卡片底部能跳过去）。
 */
export function TicketSheet({
  ticket,
  open,
  onClose,
}: {
  ticket: Ticket;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Overlay open={open} onClose={onClose} variant="sheet" labelledBy="ticket-sheet-title">
      <SheetContent ticket={ticket} onClose={onClose} />
    </Overlay>
  );
}

function SheetContent({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const catalog = useCatalog();
  const now = useNow(1000);
  const reduce = useReducedMotion() ?? false;
  const [opened] = useState(() => ticketState(ticket, Date.now()));
  const [gate, setGate] = useState<{ ok: boolean; text: string }>();
  useWakeLock();

  const state = ticketState(ticket, now);
  const live = state === "unused" || state === "entered";
  // 车站 key（或旧票闸机记录里的站码）→ 站名；枢纽显示枢纽名。
  const name = (station: string) => stationInfo(catalog.data, ticketStation(ticket, station)).name;
  const timeZone = sourceTimeZone(catalog.data, ticket.from.serverId);
  const issuer = ticketIssuer(catalog.data, ticket);
  const operator = issuer.through ? `${issuer.name} 联运` : issuer.name;

  const pass = () => {
    const at = Date.now();
    const entering = state === "unused";
    const result = entering
      ? enterGate(ticket, stationParam(ticket.from), at, hubKeys(catalog.data, ticket.from))
      : exitGate(ticket, stationParam(ticket.to), at, hubKeys(catalog.data, ticket.to));
    if (!result.ok) {
      setGate({ ok: false, text: `闸机未打开：${refusalText[result.reason]}` });
      return;
    }
    updateTicket(result.ticket);
    const station = stationParam(entering ? ticket.from : ticket.to);
    setGate({
      ok: true,
      text: `闸机已打开：${formatClock(at, timeZone)} ${name(station)}${entering ? "进站" : "出站"}`,
    });
  };

  return (
    <>
      {/* 与车站信息等面板同样的标题行：大标题 + 右边的关闭按钮。 */}
      <header className={styles.header}>
        <h2 id="ticket-sheet-title" className={styles.route}>
          {name(stationParam(ticket.from))}
          <span className={styles.arrow}>→</span>
          {name(stationParam(ticket.to))}
        </h2>
        <button type="button" className={styles.close} aria-label="收起车票" onClick={onClose}>
          <CloseIcon aria-hidden />
        </button>
      </header>
      <p className={styles.meta}>
        <StateTag state={state} pop={state !== opened && !reduce} />
        {operator} · {/* 区间票任意班次；旧版本按班次出的票照旧写起止时刻（同车票页）。 */}
        {ticket.departure !== undefined && ticket.arrival !== undefined ? (
          <span className="num">
            {clockOf(ticket.departure)} — {clockOf(ticket.arrival)}
          </span>
        ) : (
          "当日有效 · 任意班次"
        )}
      </p>

      {/* 二维码放在白色卡片里（同面板里的分组卡片），倒计时贴在下面。 */}
      <div className={styles.card}>
        <TicketQr ticket={ticket} now={now} className={styles.qr} />
        {live && (
          <div className={styles.countdown}>
            <QrCountdown now={now} />
            <p>对准闸机扫码；二维码每 30 秒刷新，截图无效。</p>
          </div>
        )}
      </div>

      {live && (
        <button type="button" className={styles.gate} onClick={pass}>
          {state === "unused"
            ? `模拟进站 · ${name(stationParam(ticket.from))}`
            : `模拟出站 · ${name(stationParam(ticket.to))}`}
        </button>
      )}
      <div role="status" className={styles.status}>
        {gate && (
          <p className={`${styles.result} ${gate.ok ? styles.ok : styles.refused}`}>{gate.text}</p>
        )}
      </div>
      <Link className={styles.full} to={`/tickets/${ticket.id}`}>
        查看完整车票
      </Link>
    </>
  );
}

/**
 * 打开期间不让屏幕自动熄灭（Screen Wake Lock，iOS 16.4 起支持）：站在闸机前不用一直点屏幕。
 * 切到后台系统会自动释放，回到前台再要一次。不支持的浏览器什么也不做。
 */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    let released = false;
    const request = async () => {
      try {
        lock = await navigator.wakeLock?.request("screen");
        if (released) void lock?.release();
      } catch {
        // 不支持或被系统拒绝（例如低电量模式）：照常显示。
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);
}
