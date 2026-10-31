import type { RailLine, RailTrain } from "@/lib/railApi.ts";
import type { AlertEffect, ServiceAlert, TripUpdate } from "@/lib/realtime.ts";

/**
 * 运行状态：把线路目录、通告、在线列车与行程更新合成每条线路的状态。纯函数，不涉及 React。
 */

export type LineState = "suspended" | "reduced" | "delayed" | "noTrains" | "normal";

export interface LineStatus {
  line: RailLine;
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
  normal: 4,
};

/** 线上有列车晚点达到这个分钟数，线路才算晚点（PIDS：5 分钟及以上为严重晚点）。 */
const delayedMinutes = 5;

export interface NetworkStatus {
  /** 有异常的线路（停运、班次取消、晚点）。 */
  attention: LineStatus[];
  /** 其余线路：运行正常，或暂无运营列车。 */
  others: LineStatus[];
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
  lines: RailLine[];
  alerts: ServiceAlert[];
  trains: RailTrain[];
  /** 行程更新，以列车名索引；用来取每列车的晚点。 */
  tripUpdates?: Map<string, TripUpdate>;
  now: number;
}): NetworkStatus {
  const alerts = input.alerts.filter((a) => isActive(a, input.now));
  const statuses = input.lines.map((line): LineStatus => {
    const lineAlerts = alerts.filter((a) => a.lineCodes.includes(line.code));
    // 停运：有针对这条线路的停运通告，或线路目录标为检修。
    const suspended =
      line.status === "MAINTENANCE" || lineAlerts.some((a) => a.effect === "noService");
    const reduced = lineAlerts.some((a) => a.effect === "reducedService");
    // /v1/rail/trains 含所有服务器的列车，同名线路要按服务器区分。
    const lineTrains = input.trains.filter(
      (t) => t.serverId === line.serverId && t.lineCode === line.code && t.inService,
    );
    const maxDelayMinutes = Math.max(
      0,
      ...lineTrains.map((t) =>
        Math.floor((input.tripUpdates?.get(t.name)?.delaySeconds ?? 0) / 60),
      ),
    );
    const base = { line, alerts: lineAlerts };
    if (suspended) return { ...base, state: "suspended" };
    if (reduced) return { ...base, state: "reduced" };
    if (maxDelayMinutes >= delayedMinutes) return { ...base, state: "delayed", maxDelayMinutes };
    if (lineTrains.length === 0) return { ...base, state: "noTrains" };
    return { ...base, state: "normal" };
  });
  const quiet = (s: LineStatus) => s.state === "normal" || s.state === "noTrains";
  return {
    attention: statuses
      .filter((s) => !quiet(s))
      .sort((a, b) => severity[a.state] - severity[b.state]),
    others: statuses.filter(quiet),
    bulletins: alerts.filter((a) => a.effect === "other" || a.lineCodes.length === 0),
  };
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
    case "normal":
      return "运行正常";
  }
}
