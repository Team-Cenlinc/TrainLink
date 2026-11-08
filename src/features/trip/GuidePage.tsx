import { useSearchParams } from "react-router";
import { Group, Page, PanelMessage } from "@/components/Page.tsx";
import { useHomeStation } from "@/lib/homeStation.ts";
import { sameHub } from "@/lib/hubs.ts";
import { useCatalog } from "@/lib/queries.ts";
import { stationName } from "./journeyText.ts";
import { GuideSummary, JourneyTimes, Timeline } from "./JourneyGuide.tsx";
import { isSavedTrip, stationFromParam, useSavedTrips, type TripRoute } from "./tripStore.ts";
import { useJourney } from "./useJourneys.ts";

/**
 * 乘坐指南（v06 Mobile 04），手机与平板上从「行程方案」点进来：
 * 大标题是起止时刻，下面概况与收藏、提醒、分享；面板里是时间线。桌面上这些内容在「行程方案」右栏。
 * 网址里带着选中方案的日期（date）、出发时刻（dep）与第一段车次（trip），按它们找回同一个方案；
 * 车次取消或时刻表变了时说明情况，不换成别的车。
 */
export function GuidePage() {
  const [params] = useSearchParams();
  const home = useHomeStation();
  const catalog = useCatalog();
  const saved = useSavedTrips();
  const from = stationFromParam(params.get("from"), home.serverId);
  const to = stationFromParam(params.get("to"), home.serverId);
  const depParam = params.get("dep");
  const dep = depParam && /^\d+$/.test(depParam) ? Number(depParam) : undefined;
  const { journey, cancelled, dayStart, loading, error } = useJourney(from, to, {
    date: params.get("date"),
    departure: dep,
    tripId: params.get("trip") ?? undefined,
  });
  const route: TripRoute | undefined = from && to ? { from, to } : undefined;
  const name = (code: string) => stationName(catalog.data, home.serverId, code);

  return (
    <Page
      back="乘坐指南"
      narrow
      title={journey ? <JourneyTimes journey={journey} /> : "—"}
      hero={
        journey &&
        route && (
          <GuideSummary
            journey={journey}
            route={route}
            saved={isSavedTrip(saved, route, (a, b) => sameHub(catalog.data, a, b))}
            dayStart={dayStart}
            name={name}
            tone="hero"
            goHref={`/trip/go?${params}`}
          />
        )
      }
    >
      {!route ? (
        <PanelMessage>没有选好起点和终点。</PanelMessage>
      ) : dep === undefined ? (
        <PanelMessage>没有选好班次，回到行程方案选一班。</PanelMessage>
      ) : !journey ? (
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
        <Group title="乘车">
          <li>
            <Timeline
              journey={journey}
              catalog={catalog.data}
              serverId={home.serverId}
              name={name}
            />
          </li>
        </Group>
      )}
    </Page>
  );
}
