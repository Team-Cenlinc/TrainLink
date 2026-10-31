import type { RailLine, RailOperator, RailTrain } from "@/lib/railApi.ts";
import type { AlertEffect, ServiceAlert, TripUpdate } from "@/lib/realtime.ts";

/**
 * 运行状态：把线路目录、通告、在线列车与行程更新合成每条线路的状态。纯函数，不涉及 React。
 */

/** unknown：读不到列车或行程更新，除停运、班次取消外说不准（不说正常，也不说没车）。 */
export type LineState = "suspended" | "reduced" | "delayed" | "noTrains" | "unknown" | "normal";

export interface LineStatus {
  line: RailLine;
  /** 线路所属运营方的代码（例如 SURC），与通告里的线路对应。 */
  operatorCode: string;
  state: LineState;
  /** 线上列车最大的晚点分钟数（晚点状态才有）。 */
  maxDelayMinutes?: number;
  /** 提到这条线路的通告：停运、班次取消的说明，以及一般公告。 */
  alerts: ServiceAlert[];
}

/** 严重程度：数字越小越靠前。「需要留意」按它排序，同级保持目录顺序。 */
const severity: Record<LineState, number> = {
  suspended: 0,
  reduced: 1,
  delayed: 2,
  noTrains: 3,
  unknown: 4,
  normal: 5,
};

/** 线上有列车晚点达到这个分钟数，线路才算晚点（PIDS：5 分钟及以上为严重晚点）。 */
const delayedMinutes = 5;

export interface NetworkStatus {
  /** 有异常的线路（停运、班次取消、晚点）。 */
  attention: LineStatus[];
  /** 其余线路：运行正常、暂无运营列车，或（缺数据时）状态不明。 */
  others: LineStatus[];
  /**
   * 列车与行程更新都读到了，晚点与「暂无运营列车」可信。为 false 时只有通告与目录给出的
   * 停运、班次取消是确定的，页面要说明晚点信息暂缺。
   */
  delaysKnown: boolean;
  /**
   * 通告列表：不影响运营的一般公告（每条一次，不论提到几条线路），以及没有指明线路的全网通告。
   * 停运、班次取消这类通告已经体现在线路状态里，不再重复。
   */
  bulletins: ServiceAlert[];
}

/** 通告此刻是否生效：没有时段就一直生效，否则 now 落在任一时段里。 */
function isActive(alert: ServiceAlert, now: number): boolean {
  const periods = alert.activePeriods ?? [];
  return (
    periods.length === 0 ||
    periods.some((p) => (p.start ?? -Infinity) <= now && now < (p.end ?? Infinity))
  );
}

export function buildNetworkStatus(input: {
  /** 要列出的线路（本服务器、设置里显示的运营方）。 */
  lines: RailLine[];
  /** 运营方目录：线路只有 operatorId，通告与列车用的是运营方码；不同运营方可能有同码的线路。 */
  operators: RailOperator[];
  alerts: ServiceAlert[];
  /** 在线列车；不给（没有读、或读取失败）时不判断晚点与「暂无运营列车」。 */
  trains?: RailTrain[];
  /** 行程更新，以列车名索引；用来取每列车的晚点。不给时晚点不明。 */
  tripUpdates?: Map<string, TripUpdate>;
  now: number;
}): NetworkStatus {
  const alerts = input.alerts.filter((a) => isActive(a, input.now));
  const operatorCode = new Map(input.operators.map((o) => [o.id, o.code]));
  const statuses = input.lines.map((line): LineStatus => {
    const operator = operatorCode.get(line.operatorId);
    const lineAlerts = alerts.filter((a) =>
      a.lines.some((l) => l.operatorCode === operator && l.lineCode === line.code),
    );
    // 停运：有针对这条线路的停运通告，或线路目录标为检修。
    const suspended =
      line.status === "MAINTENANCE" || lineAlerts.some((a) => a.effect === "noService");
    const reduced = lineAlerts.some((a) => a.effect === "reducedService");
    // /v1/rail/trains 含所有服务器的列车，同名线路要按服务器与运营方区分。
    const lineTrains = (input.trains ?? []).filter(
      (t) =>
        t.serverId === line.serverId &&
        t.operatorCode === operator &&
        t.lineCode === line.code &&
        t.inService,
    );
    const maxDelayMinutes = Math.max(
      0,
      ...lineTrains.map((t) =>
        Math.floor((input.tripUpdates?.get(t.name)?.delaySeconds ?? 0) / 60),
      ),
    );
    const base = { line, operatorCode: operator ?? "", alerts: lineAlerts };
    if (suspended) return { ...base, state: "suspended" };
    if (reduced) return { ...base, state: "reduced" };
    if (!input.trains) return { ...base, state: "unknown" };
    if (maxDelayMinutes >= delayedMinutes) return { ...base, state: "delayed", maxDelayMinutes };
    if (lineTrains.length === 0) return { ...base, state: "noTrains" };
    if (!input.tripUpdates) return { ...base, state: "unknown" };
    return { ...base, state: "normal" };
  });
  const quiet = (s: LineStatus) => severity[s.state] >= severity.noTrains;
  const shown = new Set(statuses.map((s) => `${s.operatorCode}:${s.line.code}`));
  return {
    attention: statuses
      .filter((s) => !quiet(s))
      .sort((a, b) => severity[a.state] - severity[b.state]),
    others: statuses.filter(quiet),
    delaysKnown: Boolean(input.trains && input.tripUpdates),
    // 一般公告只列与这里的线路有关的（设置里隐藏的运营方的线路不在 lines 里）；全网通告照列。
    bulletins: alerts.filter(
      (a) =>
        a.lines.length === 0 ||
        (a.effect === "other" && a.lines.some((l) => shown.has(`${l.operatorCode}:${l.lineCode}`))),
    ),
  };
}

/** 运行状态页顶部的概况：一句话，以及前面图标对应的状态（说不准时没有图标）。 */
export interface StatusSummary {
  text: string;
  state?: LineState;
}

/**
 * 概况：有异常时写几条线路需要留意；否则只说数据撑得住的话——
 * 一列车都没有（例如夜里）写暂无运营列车，读不到列车或晚点时只说没有停运与班次取消，
 * 部分线路没车时只说运行中的线路正常，全部线路都在跑才说全部正常。
 */
export function statusSummary(status: NetworkStatus): StatusSummary {
  const top = status.attention[0];
  if (top) return { text: `${status.attention.length} 条线路需要留意`, state: top.state };
  if (status.others.every((s) => s.state === "noTrains")) {
    return { text: "暂无运营列车", state: "noTrains" };
  }
  if (!status.delaysKnown) return { text: "暂无停运或班次取消" };
  if (status.others.some((s) => s.state === "noTrains")) {
    return { text: "运行中的线路均正常", state: "normal" };
  }
  return { text: "全部线路运行正常", state: "normal" };
}

/** 停运、班次取消各自对应的通告影响；提示标题优先用这类通告的标题。 */
const effectOfState: Partial<Record<LineState, AlertEffect>> = {
  suspended: "noService",
  reduced: "reducedService",
};

/** 看板顶部的运行提示：本站线路里最严重的一项。 */
export interface StationNotice {
  status: LineStatus;
  /** 说明：与状态对应的通告正文（例如「近 1 小时取消 2 班」）；晚点等没有通告的异常没有。 */
  detail?: string;
  /** 本站线路里还有几项异常没显示。 */
  more: number;
}

/** 与线路状态对应的通告（停运对应停运通告，班次取消对应班次减少通告）；其他状态没有。 */
export function stateAlert(status: LineStatus): ServiceAlert | undefined {
  const effect = effectOfState[status.state];
  return effect && status.alerts.find((a) => a.effect === effect);
}

/**
 * 本站线路的运行提示。只提示「需要留意」里的线路（停运、班次取消、晚点），一般公告不上看板。
 */
export function stationNotice(
  status: NetworkStatus,
  stationLineCodes: string[],
): StationNotice | undefined {
  const issues = status.attention.filter((s) => stationLineCodes.includes(s.line.code));
  const top = issues[0];
  if (!top) return undefined;
  return { status: top, detail: stateAlert(top)?.body, more: issues.length - 1 };
}

/** 线路状态的文字，运行状态页与看板提示共用。 */
export function stateText(status: LineStatus): string {
  switch (status.state) {
    case "suspended":
      return "暂停服务";
    case "reduced":
      return "部分班次取消";
    case "delayed":
      return `晚点，最多 ${status.maxDelayMinutes} 分钟`;
    case "noTrains":
      return "暂无运营列车";
    case "unknown":
      return "暂无实时信息";
    case "normal":
      return "运行正常";
  }
}
