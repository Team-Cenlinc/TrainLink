import { Link } from "react-router";
import ChevronIcon from "@material-symbols/svg-400/outlined/chevron_right.svg?react";
import { Group, Page, PanelMessage } from "@/components/Page.tsx";
import type { HomeStation } from "@/lib/homeStation.ts";
import { useCatalog, useNow } from "@/lib/queries.ts";
import { clockOf } from "@/features/trip/serviceDay.ts";
import { stationInfo } from "@/features/trip/stations.ts";
import { ticketState, type Ticket } from "./ticket.ts";
import { stateLabel } from "./ticketText.ts";
import { useTickets } from "./ticketStore.ts";
import styles from "./TicketsPage.module.css";
import stateStyles from "./TicketPage.module.css";

/**
 * 票夹：生成过的仿真车票。可用的（未入站、已入站）在前，用过和失效的放在「历史」。
 * 车票是区间票（两站之间当天任意班次），在乘坐指南或乘车 GO 里取；全部是仿真，不能用于真实乘车。
 */
export function TicketsPage() {
  const tickets = useTickets();
  const catalog = useCatalog();
  const now = useNow();
  const active = tickets.filter((t) => ["unused", "entered"].includes(ticketState(t, now)));
  const history = tickets.filter((t) => !active.includes(t));
  const name = (station: HomeStation) => stationInfo(catalog.data, station).name;

  const row = (ticket: Ticket) => {
    const state = ticketState(ticket, now);
    return (
      <li key={ticket.id}>
        <Link to={`/tickets/${ticket.id}`} className={styles.row}>
          <span className={styles.main}>
            <span className={styles.route}>
              {name(ticket.from)} → {name(ticket.to)}
            </span>
            <span className={`${styles.meta} num`}>
              {ticket.departure !== undefined && ticket.arrival !== undefined
                ? `${clockOf(ticket.departure)} — ${clockOf(ticket.arrival)}`
                : "当日有效"}{" "}
              · {ticket.id}
            </span>
          </span>
          <span className={`${stateStyles.state} ${stateStyles[state]}`}>{stateLabel[state]}</span>
          <ChevronIcon className={styles.chevron} aria-hidden />
        </Link>
      </li>
    );
  };

  return (
    <Page
      title="车票"
      narrow
      hero={<p className={styles.note}>仿真车票，仅供体验，不能用于真实乘车。</p>}
    >
      {tickets.length === 0 ? (
        <>
          <PanelMessage>还没有车票。规划一段行程，在乘坐指南里点「车票」生成一张。</PanelMessage>
          <Link to="/trip" className={styles.cta}>
            去规划行程
          </Link>
        </>
      ) : (
        <>
          {active.length > 0 && (
            <Group title="可用" count={active.length}>
              {active.map(row)}
            </Group>
          )}
          {history.length > 0 && (
            <Group title="历史" count={history.length}>
              {history.map(row)}
            </Group>
          )}
        </>
      )}
    </Page>
  );
}
