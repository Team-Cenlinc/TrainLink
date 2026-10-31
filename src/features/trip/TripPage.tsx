import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import ArrowIcon from "@material-symbols/svg-400/outlined/north_east.svg?react";
import HistoryIcon from "@material-symbols/svg-400/outlined/history.svg?react";
import StarIcon from "@material-symbols/svg-400/outlined/star-fill.svg?react";
import SwapIcon from "@material-symbols/svg-400/outlined/swap_vert.svg?react";
import { Group, Page } from "@/components/Page.tsx";
import { Segmented } from "@/components/Segmented.tsx";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import { StationPicker } from "@/features/stations/StationPicker.tsx";
import {
  sameStation,
  useFavoriteStations,
  useHomeStation,
  type HomeStation,
} from "@/lib/homeStation.ts";
import { useCatalog } from "@/lib/queries.ts";
import type { RailCatalog } from "@/lib/railApi.ts";
import { useLayout } from "@/lib/useLayout.ts";
import { stationInfo } from "./stations.ts";
import {
  rememberTrip,
  stationParam,
  useRecentTrips,
  useSavedTrips,
  type TripRoute,
} from "./tripStore.ts";
import styles from "./TripPage.module.css";

type When = "now" | "at";
const whenOptions = [
  { value: "now", label: "现在出发" },
  { value: "at", label: "指定时间" },
] as const;

/**
 * 规划行程（v06 Mobile 02）：起点默认是本站，选好终点就去「行程方案」。
 * 下面是收藏的行程、常用车站（作为目的地）与最近查过的行程，点一下直接查询。
 */
export function TripPage() {
  const navigate = useNavigate();
  const layout = useLayout();
  const home = useHomeStation();
  const favorites = useFavoriteStations();
  const recent = useRecentTrips();
  const saved = useSavedTrips();
  const catalog = useCatalog();
  const [from, setFrom] = useState<HomeStation>(home);
  const [to, setTo] = useState<HomeStation>();
  const [when, setWhen] = useState<When>("now");
  const [time, setTime] = useState("");
  const [picking, setPicking] = useState<{ end: "from" | "to"; anchor?: DOMRect }>();
  const [params, setParams] = useSearchParams();
  const toField = useRef<HTMLButtonElement>(null);

  // 从看板的「去哪里」进来（/trip?pick=to）：直接打开终点选择并聚焦搜索框。
  // 打开后去掉这个参数，返回或刷新时不会再自动弹出。
  useEffect(() => {
    if (params.get("pick") !== "to") return;
    setPicking({ end: "to", anchor: toField.current?.getBoundingClientRect() });
    setParams({}, { replace: true });
  }, [params, setParams]);

  const search = (route: TripRoute) => {
    rememberTrip(route);
    const at = when === "at" && time ? `&at=${time}` : "";
    navigate(`/trip/results?from=${stationParam(route.from)}&to=${stationParam(route.to)}${at}`);
  };
  const choose = (station: HomeStation) => {
    if (picking?.end === "from") {
      setFrom(station);
      if (to) search({ from: station, to });
    } else {
      setTo(station);
      search({ from, to: station });
    }
  };
  const fromInfo = stationInfo(catalog.data, from);
  const toInfo = to && stationInfo(catalog.data, to);
  const destinations = favorites.filter((f) => !sameStation(f, from));

  return (
    <Page
      title="规划行程"
      hero={
        <div className={styles.ends}>
          <div className={styles.fields}>
            <button
              type="button"
              className={styles.field}
              onClick={(e) =>
                setPicking({ end: "from", anchor: e.currentTarget.getBoundingClientRect() })
              }
            >
              <span className={styles.fieldLabel}>从</span>
              <span className={styles.fieldName}>{fromInfo.name}</span>
              <Badges lines={fromInfo.lines} />
            </button>
            <button
              ref={toField}
              type="button"
              className={`${styles.field} ${to ? "" : styles.empty}`}
              onClick={(e) =>
                setPicking({ end: "to", anchor: e.currentTarget.getBoundingClientRect() })
              }
            >
              <span className={styles.fieldLabel}>到</span>
              <span className={styles.fieldName}>{toInfo?.name ?? "去哪里？"}</span>
              {toInfo && <Badges lines={toInfo.lines} />}
            </button>
          </div>
          <button
            type="button"
            className={styles.swap}
            aria-label="交换起点和终点"
            disabled={!to}
            onClick={() => {
              if (!to) return;
              setFrom(to);
              setTo(from);
            }}
          >
            <SwapIcon aria-hidden />
          </button>
        </div>
      }
    >
      <div className={styles.when}>
        <Segmented label="出发时间" options={whenOptions} value={when} onChange={setWhen} />
        {when === "at" && (
          <input
            type="time"
            className={styles.time}
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label="出发时刻"
          />
        )}
        {to && (
          <button type="button" className={styles.go} onClick={() => search({ from, to })}>
            查询
          </button>
        )}
      </div>

      {/* 面板够宽（≥ 700）时分两栏：左边收藏与常用目的地，右边最近（同运行状态页）。 */}
      <div className={styles.columns}>
        <div className={styles.column}>
          {saved.length > 0 && (
            <Group title="收藏的行程">
              {saved.map((route) => (
                <RouteRow
                  key={stationParam(route.from) + stationParam(route.to)}
                  route={route}
                  catalog={catalog.data}
                  icon={<StarIcon aria-hidden />}
                  onClick={() => search(route)}
                />
              ))}
            </Group>
          )}

          {destinations.length > 0 && (
            <Group title="常用目的地">
              {destinations.map((station) => {
                const info = stationInfo(catalog.data, station);
                return (
                  <li key={stationParam(station)}>
                    <button
                      type="button"
                      className={styles.row}
                      onClick={() => {
                        setTo(station);
                        search({ from, to: station });
                      }}
                    >
                      <Badges lines={info.lines} />
                      <span className={styles.rowName}>{info.name}</span>
                      <ArrowIcon className={styles.rowIcon} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </Group>
          )}
        </div>
        <div className={styles.column}>
          {recent.length > 0 && (
            <Group title="最近">
              {recent.map((route) => (
                <RouteRow
                  key={stationParam(route.from) + stationParam(route.to)}
                  route={route}
                  catalog={catalog.data}
                  icon={<HistoryIcon aria-hidden />}
                  onClick={() => search(route)}
                />
              ))}
            </Group>
          )}
        </div>
      </div>

      <StationPicker
        open={picking !== undefined}
        onClose={() => setPicking(undefined)}
        variant={layout === "compact" ? "sheet" : "popover"}
        anchor={picking?.anchor}
        title={picking?.end === "from" ? "从哪里出发" : "去哪里"}
        onChoose={choose}
        focusSearch
      />
    </Page>
  );
}

/** 一条行程（起点 → 终点），前面一个小图标说明来源（收藏或最近）。 */
function RouteRow({
  route,
  catalog,
  icon,
  onClick,
}: {
  route: TripRoute;
  catalog: RailCatalog | undefined;
  icon: ReactNode;
  onClick: () => void;
}) {
  const a = stationInfo(catalog, route.from);
  const b = stationInfo(catalog, route.to);
  return (
    <li>
      <button type="button" className={styles.row} onClick={onClick}>
        <span className={styles.rowLead}>{icon}</span>
        <span className={styles.rowName}>
          {a.name} → {b.name}
        </span>
        <ArrowIcon className={styles.rowIcon} aria-hidden />
      </button>
    </li>
  );
}

/** 车站停靠的线路，小号色牌一排。 */
function Badges({ lines }: { lines: { lineId: string; lineCode: string; color?: string }[] }) {
  return (
    <span className={styles.badges}>
      {lines.map((l) => (
        <ServiceBadge key={l.lineId} lineCode={l.lineCode} lineColor={l.color} size="s" />
      ))}
    </span>
  );
}
