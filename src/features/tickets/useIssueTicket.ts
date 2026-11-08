import { useRef } from "react";
import { useNavigate } from "react-router";
import { lineKey } from "@/lib/gtfs.ts";
import { useCatalog } from "@/lib/queries.ts";
import { sourceTimeZone } from "@/lib/railApi.ts";
import type { Journey } from "@/features/trip/planner.ts";
import type { TripRoute } from "@/features/trip/tripStore.ts";
import { issueTicket } from "./ticket.ts";
import { addTicket } from "./ticketStore.ts";

/** 为一个行程方案出一张仿真车票，放进票夹，然后打开这张票。dayStart 是这个方案所在运营日的 0 点。 */
export function useIssueTicket() {
  const navigate = useNavigate();
  const catalog = useCatalog();
  // 连点两下只出一张：跳转到车票页之前的这一小段时间里，再按不再出票。
  const issuing = useRef(false);
  return (route: TripRoute, journey: Journey, dayStart: number) => {
    if (issuing.current) return;
    issuing.current = true;
    setTimeout(() => (issuing.current = false), 1000);
    const timeZone = sourceTimeZone(catalog.data, route.from.serverId);
    const now = Date.now();
    const ticket = issueTicket({
      route,
      journey: {
        departure: journey.departure,
        arrival: journey.arrival,
        // 运营方:线路码（线路码只在运营方内唯一）；车票页按它找线路色。
        lineCodes: [
          ...new Set(
            journey.legs.flatMap((l) =>
              l.kind === "ride" ? l.lineCodes.map((code) => lineKey(l.operatorCode, code)) : [],
            ),
          ),
        ],
        tripId: journey.legs.find((l) => l.kind === "ride")?.tripId,
      },
      now,
      dayStart,
      timeZone,
    });
    addTicket(ticket);
    // 带上 fresh：车票页据此播一次「出票」动画，之后再打开就不播了。
    navigate(`/tickets/${ticket.id}`, { state: { fresh: true } });
  };
}
