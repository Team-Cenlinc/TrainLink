import { useSearchParams } from "react-router";
import { Group, Page, PanelMessage } from "@/components/Page.tsx";
import { useHomeStation } from "@/lib/homeStation.ts";
import { useCatalog } from "@/lib/queries.ts";
import { stationName } from "./journeyText.ts";
import { GuideSummary, JourneyTimes, Timeline } from "./JourneyGuide.tsx";
import { isSavedTrip, stationFromParam, useSavedTrips, type TripRoute } from "./tripStore.ts";
import { useJourneys } from "./useJourneys.ts";

/**
 * 乘坐指南（v06 Mobile 04），手机与平板上从「行程方案」点进来：
 * 大标题是起止时刻，下面概况与收藏、提醒、分享；面板里是时间线。桌面上这些内容在「行程方案」右栏。
 */
export function GuidePage() {
  const [params] = useSearchParams();
  const home = useHomeStation();
  const catalog = useCatalog();
  const saved = useSavedTrips();
  const from = stationFromParam(params.get("from"), home.serverId);
  const to = stationFromParam(params.get("to"), home.serverId);
  const dep = Number(params.get("dep"));
  const { journeys, nowSeconds, loading, error } = useJourneys(
    from,
    to,
    Number.isFinite(dep) ? dep : undefined,
    1,
  );
  const journey = journeys?.[0];
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
            saved={isSavedTrip(saved, route)}
            nowSeconds={nowSeconds}
            name={name}
            tone="hero"
          />
        )
      }
    >
      {!route ? (
        <PanelMessage>没有选好起点和终点。</PanelMessage>
      ) : !journey ? (
        <PanelMessage>
          {loading
            ? "正在读取时刻表…"
            : error
              ? "时刻表暂时读不到，稍后再试。"
              : "这个班次已经开走或取消了，回到行程方案重新选一班。"}
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
