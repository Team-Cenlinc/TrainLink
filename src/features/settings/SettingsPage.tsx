import { useEffect, useState } from "react";
import CheckIcon from "@material-symbols/svg-400/outlined/check_circle-fill.svg?react";
import UncheckedIcon from "@material-symbols/svg-400/outlined/radio_button_unchecked.svg?react";
import { Group, Page, PanelMessage } from "@/components/Page.tsx";
import { Segmented } from "@/components/Segmented.tsx";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import { clearTickets, useTickets } from "@/features/tickets/ticketStore.ts";
import { clearTrips, useRecentTrips, useSavedTrips } from "@/features/trip/tripStore.ts";
import { setHomeStation, useFavoriteStations, useHomeStation } from "@/lib/homeStation.ts";
import { useCatalog } from "@/lib/queries.ts";
import { clearQueryCache } from "@/lib/queryClient.ts";
import type { RailCatalog, RailSource } from "@/lib/railApi.ts";
import {
  remindChoices,
  stationOnServer,
  toggleOperator,
  updateSettings,
  useSettings,
  type Theme,
} from "@/lib/settings.ts";
import { useManualFoldOffered } from "@/lib/useLayout.ts";
import styles from "./SettingsPage.module.css";

const themeOptions = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
] as const satisfies readonly { value: Theme; label: string }[];

const remindOptions = remindChoices.map((m) => ({ value: String(m), label: `${m} 分钟` }));

const sourceStateText: Record<RailSource["state"], string> = {
  fresh: "数据正常",
  unavailable: "暂时读不到",
  incompatible: "版本不兼容",
};

/**
 * 设置：服务器（整个 App 的范围）、显示哪些运营方、外观、出发提醒、清除本地数据、关于。
 * 每项改了立即生效并保存在本地，没有「保存」按钮。
 */
export function SettingsPage() {
  const catalog = useCatalog();
  const settings = useSettings();
  const foldOffered = useManualFoldOffered();
  return (
    <Page title="设置" narrow>
      {!catalog.data ? (
        <PanelMessage>
          {catalog.isPending ? "正在读取线路目录…" : "暂时读不到线路目录，稍后再试。"}
        </PanelMessage>
      ) : (
        <>
          <ServerGroup catalog={catalog.data} hiddenOperators={settings.hiddenOperators} />
          <OperatorGroup catalog={catalog.data} hiddenOperators={settings.hiddenOperators} />
        </>
      )}

      <Group title="外观">
        <li className={styles.choice}>
          <Segmented
            label="外观"
            options={themeOptions}
            value={settings.theme}
            onChange={(theme) => updateSettings({ theme })}
          />
        </li>
        <li>
          <button
            type="button"
            role="switch"
            aria-checked={settings.showStationCodes}
            className={styles.row}
            onClick={() => updateSettings({ showStationCodes: !settings.showStationCodes })}
          >
            <span className={styles.main}>
              <span className={styles.name}>显示站码</span>
            </span>
            <span
              className={`${styles.switch} ${settings.showStationCodes ? styles.on : ""}`}
              aria-hidden
            />
          </button>
        </li>
        <li className={styles.footnote}>在车站名旁边显示站码（如 PTK），熟悉线网时方便对照。</li>
        {foldOffered && (
          <>
            <li>
              <button
                type="button"
                role="switch"
                aria-checked={settings.manualFold}
                className={styles.row}
                onClick={() => updateSettings({ manualFold: !settings.manualFold })}
              >
                <span className={styles.main}>
                  <span className={styles.name}>半折布局</span>
                </span>
                <span
                  className={`${styles.switch} ${settings.manualFold ? styles.on : ""}`}
                  aria-hidden
                />
              </button>
            </li>
            <li className={styles.footnote}>
              折叠屏用：内容避开屏幕中间的折痕，横放分左右两屏，竖放分上下两屏。
            </li>
          </>
        )}
      </Group>

      <Group title="出发提醒">
        <li className={styles.choice}>
          <Segmented
            label="出发提醒提前时间"
            options={remindOptions}
            value={String(settings.remindMinutes)}
            onChange={(value) => updateSettings({ remindMinutes: Number(value) })}
          />
          <p className={styles.note}>
            在乘坐指南里点「提醒」，出发前这么多分钟通知你。需要保持 TrainLink 打开。
          </p>
        </li>
      </Group>

      <DataGroup />
      <AboutGroup />
    </Page>
  );
}

/** 服务器：一台一行，选中的打勾。换服务器时本站换成那台服务器上的车站。 */
function ServerGroup({
  catalog,
  hiddenOperators,
}: {
  catalog: RailCatalog;
  hiddenOperators: string[];
}) {
  const home = useHomeStation();
  const favorites = useFavoriteStations();
  const choose = (serverId: string) => {
    if (serverId === home.serverId) return;
    const station = stationOnServer(serverId, favorites, catalog, hiddenOperators);
    if (station) setHomeStation(station);
  };
  return (
    <Group title="服务器">
      {catalog.sources.map((source) => {
        const current = source.serverId === home.serverId;
        const Icon = current ? CheckIcon : UncheckedIcon;
        return (
          <li key={source.serverId}>
            <button
              type="button"
              role="radio"
              aria-checked={current}
              className={styles.row}
              onClick={() => choose(source.serverId)}
            >
              <span className={styles.main}>
                <span className={`${styles.name} ${styles.serverName}`}>{source.serverId}</span>
                <span className={styles.meta}>
                  {sourceStateText[source.state]}
                  {source.timezone && ` · ${source.timezone}`}
                </span>
              </span>
              <Icon className={`${styles.mark} ${current ? styles.on : ""}`} aria-hidden />
            </button>
          </li>
        );
      })}
    </Group>
  );
}

/** 运营方：当前服务器上的每一家一行，带它的线路色牌与开关；至少留一家显示。 */
function OperatorGroup({
  catalog,
  hiddenOperators,
}: {
  catalog: RailCatalog;
  hiddenOperators: string[];
}) {
  const home = useHomeStation();
  const operators = catalog.operators.filter((o) => o.serverId === home.serverId);
  const shownCount = operators.filter((o) => !hiddenOperators.includes(o.id)).length;
  return (
    <Group
      title="显示的运营方"
      count={shownCount}
      action={operators.length > 1 ? "至少保留一家" : undefined}
    >
      {operators.map((operator) => {
        const shown = !hiddenOperators.includes(operator.id);
        const locked = shown && shownCount === 1;
        const lines = catalog.lines.filter((l) => l.operatorId === operator.id);
        return (
          <li key={operator.id}>
            <button
              type="button"
              role="switch"
              aria-checked={shown}
              aria-disabled={locked}
              className={styles.row}
              onClick={() =>
                updateSettings({
                  hiddenOperators: toggleOperator(hiddenOperators, operator.id, catalog.operators),
                })
              }
            >
              <span className={styles.main}>
                <span className={styles.name}>
                  {operator.name}
                  <span className={styles.code}>{operator.code}</span>
                </span>
                {lines.length > 0 && (
                  <span className={styles.badges}>
                    {lines.map((line) => (
                      <ServiceBadge
                        key={line.id}
                        lineCode={line.code}
                        lineColor={line.color}
                        size="s"
                      />
                    ))}
                  </span>
                )}
              </span>
              <span className={`${styles.switch} ${shown ? styles.on : ""}`} aria-hidden />
            </button>
          </li>
        );
      })}
      <li className={styles.footnote}>
        车站选择、全线视图与运行状态只列显示的运营方；看板上本站的发车与行程规划不受影响。
      </li>
    </Group>
  );
}

/** 清除本地数据：数据缓存、行程记录、票夹各一行，按一次变成「确认清除」，再按才清。 */
function DataGroup() {
  const recent = useRecentTrips();
  const saved = useSavedTrips();
  const tickets = useTickets();
  return (
    <Group title="本地数据">
      <DataRow
        name="数据缓存"
        detail="线路目录、站牌与实时数据。清除后重新读取。"
        onClear={clearQueryCache}
      />
      <DataRow
        name="行程记录"
        detail={`最近查过的 ${recent.length} 条，收藏的 ${saved.length} 条。`}
        empty={recent.length + saved.length === 0}
        onClear={clearTrips}
      />
      <DataRow
        name="票夹"
        detail={`${tickets.length} 张仿真车票。`}
        empty={tickets.length === 0}
        onClear={clearTickets}
      />
    </Group>
  );
}

function DataRow({
  name,
  detail,
  empty = false,
  onClear,
}: {
  name: string;
  detail: string;
  empty?: boolean;
  onClear: () => void | Promise<void>;
}) {
  const [step, setStep] = useState<"idle" | "confirm" | "done">("idle");
  // 「确认清除」几秒内不按就收回，免得之后误触。
  useEffect(() => {
    if (step === "idle") return;
    const timer = setTimeout(() => setStep("idle"), step === "confirm" ? 4000 : 2000);
    return () => clearTimeout(timer);
  }, [step]);
  const press = async () => {
    if (step === "idle") return setStep("confirm");
    if (step !== "confirm") return;
    await onClear();
    setStep("done");
  };
  return (
    <li className={`${styles.row} ${styles.static}`}>
      <span className={styles.main}>
        <span className={styles.name}>{name}</span>
        <span className={styles.meta}>{detail}</span>
      </span>
      <button
        type="button"
        className={`${styles.clear} ${step === "confirm" ? styles.confirm : ""}`}
        disabled={step === "done" || (empty && step === "idle")}
        onClick={press}
      >
        {step === "confirm" ? "确认清除" : step === "done" ? "已清除" : "清除"}
      </button>
    </li>
  );
}

/** 关于：版本、数据来源，以及仿真车票的说明。 */
function AboutGroup() {
  return (
    <Group title="关于">
      <li className={`${styles.row} ${styles.static}`}>
        <span className={styles.main}>
          <span className={styles.name}>TrainLink</span>
          <span className={styles.meta}>
            {/* package.json 里写作 0.0.1-beta（semver），显示成「0.0.1 beta」。 */}
            版本 <span className="num">{__APP_VERSION__.replace("-", " ")}</span>
          </span>
        </span>
      </li>
      <li className={`${styles.row} ${styles.static}`}>
        <span className={styles.main}>
          <span className={styles.name}>数据来源</span>
          <span className={styles.meta}>Fetarute 铁路 API（线路目录、站牌、GTFS 与实时数据）</span>
        </span>
      </li>
      <li className={styles.footnote}>仿真车票只供体验，不接入任何真实系统，不能乘车。</li>
    </Group>
  );
}
