import { useMemo, useSyncExternalStore } from "react";
import type { HomeStation } from "./homeStation.ts";
import { useCatalog } from "./queries.ts";
import type { RailCatalog, RailOperator } from "./railApi.ts";

/**
 * 设置：外观、出发提醒提前几分钟、不显示的运营方。保存在浏览器本地，整个 App 共用
 * （写法同 homeStation.ts）。服务器不单独保存：当前服务器就是本站所在的服务器。
 */

export type Theme = "system" | "light" | "dark";

export interface Settings {
  theme: Theme;
  /** 出发提醒提前几分钟。 */
  remindMinutes: number;
  /** 不显示的运营方（catalog 里运营方的 id）。存「不显示」的：以后新增的运营方默认显示。 */
  hiddenOperators: string[];
}

/** 提醒可选的提前分钟数。 */
export const remindChoices = [3, 5, 10, 15];

export const defaultSettings: Settings = {
  theme: "system",
  remindMinutes: 5,
  hiddenOperators: [],
};

const themes: Theme[] = ["system", "light", "dark"];

/** 读出本地存储里的设置文字；缺少或不合法的字段用默认值，不让一项坏数据拖垮全部设置。 */
export function parseSettings(text: string | null): Settings {
  let raw: Partial<Record<keyof Settings, unknown>> = {};
  try {
    const parsed: unknown = JSON.parse(text ?? "{}");
    if (parsed && typeof parsed === "object") raw = parsed;
  } catch {
    // 用默认值。
  }
  return {
    theme: themes.includes(raw.theme as Theme) ? (raw.theme as Theme) : defaultSettings.theme,
    remindMinutes: remindChoices.includes(raw.remindMinutes as number)
      ? (raw.remindMinutes as number)
      : defaultSettings.remindMinutes,
    hiddenOperators:
      Array.isArray(raw.hiddenOperators) &&
      raw.hiddenOperators.every((id) => typeof id === "string")
        ? raw.hiddenOperators
        : defaultSettings.hiddenOperators,
  };
}

/**
 * 隐藏或重新显示一家运营方，返回新的隐藏列表。
 * 同一台服务器上至少留一家显示：要隐藏的是最后一家时原样返回。
 */
export function toggleOperator(
  hidden: string[],
  operatorId: string,
  operators: Pick<RailOperator, "id" | "serverId">[],
): string[] {
  if (hidden.includes(operatorId)) return hidden.filter((id) => id !== operatorId);
  const serverId = operators.find((o) => o.id === operatorId)?.serverId;
  const othersShown = operators.some(
    (o) => o.serverId === serverId && o.id !== operatorId && !hidden.includes(o.id),
  );
  return othersShown ? [...hidden, operatorId] : hidden;
}

/**
 * 切换到另一台服务器时的本站：那台服务器上的第一个常用车站；没有就用目录里
 * 显示的运营方的第一个车站（都隐藏了就不挑运营方）。那台服务器没有车站时返回 undefined。
 */
export function stationOnServer(
  serverId: string,
  favorites: HomeStation[],
  catalog: Pick<RailCatalog, "operators" | "stations">,
  hiddenOperators: string[],
): HomeStation | undefined {
  const favorite = favorites.find((f) => f.serverId === serverId);
  if (favorite) return favorite;
  const onServer = catalog.stations.filter((s) => s.serverId === serverId);
  const station = onServer.find((s) => !hiddenOperators.includes(s.operatorId)) ?? onServer[0];
  if (!station) return undefined;
  const operatorCode = catalog.operators.find((o) => o.id === station.operatorId)?.code ?? "";
  return { serverId, operatorCode, stationCode: station.code };
}

const key = "trainlink.settings";

function load(): Settings {
  try {
    return parseSettings(localStorage.getItem(key));
  } catch {
    return defaultSettings;
  }
}

let settings = load();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** 地址栏颜色（index.html 里两个 theme-color，各带 media），与 --canvas 一致。 */
const themeColors = { light: "#F0F1F0", dark: "#111416" };

/**
 * 把外观写到 <html data-theme>（tokens.css 据此选配色），地址栏颜色跟着改。
 * 跟随系统时去掉 data-theme，两个 theme-color 各按自己的 media 生效。
 */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own = meta.media.includes("dark") ? "dark" : "light";
    meta.content = themeColors[theme === "system" ? own : theme];
  }
}

/** 改几项设置并保存。 */
export function updateSettings(patch: Partial<Settings>) {
  if (patch.theme && patch.theme !== settings.theme) applyTheme(patch.theme);
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(key, JSON.stringify(settings));
  } catch {
    // 存不下也不影响本次使用。
  }
  listeners.forEach((listener) => listener());
}

/** 读取设置（不订阅变化），用于非组件代码。 */
export function readSettings(): Settings {
  return settings;
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, () => settings);
}

/**
 * 设置里显示哪些运营方：车站选择、全线视图的线路、运行状态据此筛选
 * （看板上本站的发车与行程规划不筛选，免得漏车）。
 * byId 按 catalog 里运营方的 id；byCode 按服务器与运营方码（车站的线路、通告、列车用的是码）。
 */
export function useShownOperators() {
  const { hiddenOperators } = useSettings();
  const catalog = useCatalog();
  return useMemo(() => {
    const hiddenCodes = new Set(
      (catalog.data?.operators ?? [])
        .filter((o) => hiddenOperators.includes(o.id))
        .map((o) => `${o.serverId}:${o.code}`),
    );
    return {
      byId: (operatorId: string) => !hiddenOperators.includes(operatorId),
      byCode: (serverId: string, operatorCode: string) =>
        !hiddenCodes.has(`${serverId}:${operatorCode}`),
    };
  }, [hiddenOperators, catalog.data]);
}
