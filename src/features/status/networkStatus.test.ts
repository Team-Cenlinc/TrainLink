import { describe, expect, it } from "vitest";
import type { RailLine, RailOperator, RailTrain } from "@/lib/railApi.ts";
import type { ServiceAlert, TripUpdate } from "@/lib/realtime.ts";
import { buildNetworkStatus, stationNotice, statusSummary } from "./networkStatus.ts";

const now = Date.UTC(2026, 9, 31, 1, 0);

function line(code: string, status = "ACTIVE"): RailLine {
  return {
    id: `survival:SURC:${code}`,
    serverId: "survival",
    operatorId: "survival:SURC",
    code,
    name: `${code} 线`,
    serviceType: "METRO",
    status,
  };
}

/** 两家运营方：生存中部铁路与蒲塘桥都会区交通。 */
const operators: RailOperator[] = [
  { id: "survival:SURC", serverId: "survival", code: "SURC", name: "生存中部铁路" },
  { id: "survival:PUAT", serverId: "survival", code: "PUAT", name: "蒲塘桥都会区交通" },
];

/** 通告涉及的生存中部铁路线路。 */
const on = (...codes: string[]) => codes.map((lineCode) => ({ operatorCode: "SURC", lineCode }));

function train(name: string, lineCode: string): RailTrain {
  return {
    serverId: "survival",
    name,
    operatorCode: "SURC",
    lineCode,
    inService: true,
    speedBlocksPerSecond: 5,
    updatedAt: "",
  };
}

/** 某列车的行程更新，只关心整车晚点秒数。 */
function delayed(trainName: string, delaySeconds: number): [string, TripUpdate] {
  return [trainName, { trainName, tripId: trainName, delaySeconds, stops: [] }];
}

function alert(overrides: Partial<ServiceAlert>): ServiceAlert {
  return { id: "a", title: "通告", lines: [], effect: "other", ...overrides };
}

describe("buildNetworkStatus", () => {
  it("通告只列与显示的线路有关的：设置里隐藏的运营方的线路不在 lines 里，它们的通告也不列；全网通告照列", () => {
    const status = buildNetworkStatus({
      operators,
      lines: [line("MT")],
      alerts: [
        alert({ id: "mt", title: "大都会线新车", lines: on("MT") }),
        alert({ id: "sm", title: "单轨线检修", lines: [{ operatorCode: "PUAT", lineCode: "SM" }] }),
        alert({ id: "all", title: "全网通告" }),
      ],
      trains: [],
      now,
    });

    expect(status.bulletins.map((a) => a.id)).toEqual(["mt", "all"]);
  });

  it("线路收到停运通告时列在「需要留意」，状态为暂停服务", () => {
    const status = buildNetworkStatus({
      operators,
      lines: [line("MT"), line("DS")],
      alerts: [alert({ title: "探索线：全线停运", lines: on("DS"), effect: "noService" })],
      trains: [train("SURC-MT-LP-1", "MT")],
      now,
    });

    expect(status.attention.map((s) => [s.line.code, s.state])).toEqual([["DS", "suspended"]]);
  });

  it("线路目录标为检修（MAINTENANCE）时，即使没有通告也算暂停服务", () => {
    const status = buildNetworkStatus({
      operators,
      lines: [line("DS", "MAINTENANCE")],
      alerts: [],
      trains: [],
      now,
    });

    expect(status.attention.map((s) => [s.line.code, s.state])).toEqual([["DS", "suspended"]]);
  });

  it("班次减少的通告让线路显示为部分班次取消", () => {
    const status = buildNetworkStatus({
      operators,
      lines: [line("MT")],
      alerts: [
        alert({ title: "大都会线：部分班次取消", lines: on("MT"), effect: "reducedService" }),
      ],
      trains: [train("SURC-MT-LP-1", "MT")],
      now,
    });

    expect(status.attention.map((s) => [s.line.code, s.state])).toEqual([["MT", "reduced"]]);
  });

  it("有列车晚点 5 分钟以上时线路显示晚点，并给出最大晚点分钟数；不到 5 分钟不算", () => {
    const status = buildNetworkStatus({
      operators,
      lines: [line("MT"), line("WS")],
      alerts: [],
      trains: [
        train("SURC-MT-LP-1", "MT"),
        train("SURC-MT-LP-2", "MT"),
        train("SURC-WS-LN-1", "WS"),
      ],
      tripUpdates: new Map([
        delayed("SURC-MT-LP-1", 7 * 60 + 20),
        delayed("SURC-MT-LP-2", 2 * 60),
        delayed("SURC-WS-LN-1", 4 * 60 + 59),
      ]),
      now,
    });

    expect(status.attention.map((s) => [s.line.code, s.state, s.maxDelayMinutes])).toEqual([
      ["MT", "delayed", 7],
    ]);
    expect(status.others.map((s) => [s.line.code, s.state])).toEqual([["WS", "normal"]]);
  });

  it("线路正常但线上没有运营中的列车时，在「其他线路」显示暂无运营列车", () => {
    const status = buildNetworkStatus({
      operators,
      lines: [line("MT"), line("SM")],
      alerts: [],
      trains: [train("SURC-MT-LP-1", "MT"), { ...train("SURC-SM-1", "SM"), inService: false }],
      tripUpdates: new Map(),
      now,
    });

    expect(status.attention).toEqual([]);
    expect(status.others.map((s) => [s.line.code, s.state])).toEqual([
      ["MT", "normal"],
      ["SM", "noTrains"],
    ]);
  });

  it("「需要留意」按严重程度排：停运在前，其次部分班次取消，最后晚点", () => {
    const status = buildNetworkStatus({
      operators,
      lines: [line("MT"), line("IS"), line("DS", "MAINTENANCE")],
      alerts: [alert({ lines: on("IS"), effect: "reducedService" })],
      trains: [train("SURC-MT-LP-1", "MT"), train("SURC-IS-1", "IS")],
      tripUpdates: new Map([delayed("SURC-MT-LP-1", 6 * 60)]),
      now,
    });

    expect(status.attention.map((s) => s.line.code)).toEqual(["DS", "IS", "MT"]);
  });

  it("一般公告每条只列一次（不论提到几条线路），同时挂在提到的线路上；公告不会让线路变成异常", () => {
    const welcome = alert({ id: "welcome", title: "欢迎试乘海岛线！", lines: on("IS", "WS") });
    const network = alert({ id: "network", title: "临时停运", lines: on() });
    const status = buildNetworkStatus({
      operators,
      lines: [line("IS"), line("WS")],
      alerts: [welcome, network],
      trains: [train("SURC-IS-1", "IS"), train("SURC-WS-1", "WS")],
      now,
    });

    expect(status.attention).toEqual([]);
    expect(status.others.map((s) => [s.line.code, s.alerts.map((a) => a.id)])).toEqual([
      ["IS", ["welcome"]],
      ["WS", ["welcome"]],
    ]);
    expect(status.bulletins.map((a) => a.id)).toEqual(["welcome", "network"]);
  });

  it("只算同一服务器的列车：别的服务器上同名线路的晚点不影响这里", () => {
    const status = buildNetworkStatus({
      operators,
      lines: [line("MT")],
      alerts: [],
      trains: [train("SURC-MT-LP-1", "MT"), { ...train("OTHER-MT-1", "MT"), serverId: "creative" }],
      tripUpdates: new Map([delayed("OTHER-MT-1", 20 * 60)]),
      now,
    });

    expect(status.others.map((s) => [s.line.code, s.state])).toEqual([["MT", "normal"]]);
  });

  it("线路按运营方区分：别家同码线路的停运通告与列车都不影响这里", () => {
    const surcSM = line("SM");
    const puatSM: RailLine = { ...line("SM"), id: "survival:PUAT:SM", operatorId: "survival:PUAT" };
    const status = buildNetworkStatus({
      operators,
      lines: [surcSM, puatSM],
      alerts: [alert({ lines: [{ operatorCode: "PUAT", lineCode: "SM" }], effect: "noService" })],
      trains: [{ ...train("PUAT-SM-1", "SM"), operatorCode: "PUAT" }],
      now,
    });

    expect(status.attention.map((s) => [s.line.id, s.state])).toEqual([
      ["survival:PUAT:SM", "suspended"],
    ]);
    expect(status.others.map((s) => [s.line.id, s.state])).toEqual([
      ["survival:SURC:SM", "noTrains"],
    ]);
  });

  it("读不到列车时仍按通告与目录给出停运、班次取消；其余线路状态不明，不说正常也不说没车", () => {
    const status = buildNetworkStatus({
      operators,
      lines: [line("MT"), line("DS", "MAINTENANCE"), line("WS")],
      alerts: [alert({ lines: on("MT"), effect: "reducedService" })],
      now,
    });

    expect(status.attention.map((s) => [s.line.code, s.state])).toEqual([
      ["DS", "suspended"],
      ["MT", "reduced"],
    ]);
    expect(status.others.map((s) => [s.line.code, s.state])).toEqual([["WS", "unknown"]]);
    expect(status.delaysKnown).toBe(false);
  });

  it("有列车但读不到行程更新时，晚点不明：在跑的线路状态不明，没车的线路仍是暂无运营列车", () => {
    const status = buildNetworkStatus({
      operators,
      lines: [line("MT"), line("WS")],
      alerts: [],
      trains: [train("SURC-MT-LP-1", "MT")],
      now,
    });

    expect(status.others.map((s) => [s.line.code, s.state])).toEqual([
      ["MT", "unknown"],
      ["WS", "noTrains"],
    ]);
    expect(status.delaysKnown).toBe(false);
  });

  it("只看当前生效的通告：已经结束、还没开始的都不算", () => {
    const hour = 60 * 60_000;
    const status = buildNetworkStatus({
      operators,
      lines: [line("MT"), line("WS")],
      alerts: [
        alert({ lines: on("MT"), effect: "noService", activePeriods: [{ end: now - hour }] }),
        alert({ lines: on("WS"), effect: "noService", activePeriods: [{ start: now + hour }] }),
        alert({ id: "network-old", activePeriods: [{ start: now - 2 * hour, end: now - hour }] }),
      ],
      trains: [train("SURC-MT-LP-1", "MT"), train("SURC-WS-1", "WS")],
      now,
    });

    expect(status.attention).toEqual([]);
    expect(status.bulletins).toEqual([]);
  });
});

describe("stationNotice", () => {
  const status = buildNetworkStatus({
    operators,
    lines: [line("DS", "MAINTENANCE"), line("MT"), line("WS"), line("IS")],
    alerts: [
      alert({
        title: "大都会线：部分班次取消",
        body: "近 1 小时取消 2 班",
        lines: on("MT"),
        effect: "reducedService",
      }),
      alert({ title: "欢迎试乘海岛线！", lines: on("IS") }),
    ],
    trains: [train("SURC-MT-LP-1", "MT"), train("SURC-WS-1", "WS"), train("SURC-IS-1", "IS")],
    tripUpdates: new Map([delayed("SURC-WS-1", 9 * 60)]),
    now,
  });

  it("看板提示本站线路里最严重的一项，附上通告正文作说明，并说明还有几项", () => {
    const notice = stationNotice(status, ["MT", "WS"]);

    expect(notice?.status.line.code).toBe("MT");
    expect(notice?.status.state).toBe("reduced");
    expect(notice?.detail).toBe("近 1 小时取消 2 班");
    expect(notice?.more).toBe(1);
  });

  it("没有对应通告的异常（例如晚点）没有说明，状态里带着晚点分钟数", () => {
    const notice = stationNotice(status, ["WS"]);

    expect(notice?.status.state).toBe("delayed");
    expect(notice?.status.maxDelayMinutes).toBe(9);
    expect(notice?.detail).toBeUndefined();
  });

  it("本站线路都正常时不提示，一般公告也不提示", () => {
    expect(stationNotice(status, ["IS"])).toBeUndefined();
  });
});

describe("statusSummary", () => {
  const build = (input: Partial<Parameters<typeof buildNetworkStatus>[0]>) =>
    buildNetworkStatus({ operators, lines: [line("MT"), line("WS")], alerts: [], now, ...input });

  it("有异常时写几条线路需要留意，图标跟着最严重的一项", () => {
    const summary = statusSummary(
      build({ lines: [line("MT", "MAINTENANCE"), line("WS")], trains: [], tripUpdates: new Map() }),
    );

    expect(summary).toEqual({ text: "1 条线路需要留意", state: "suspended" });
  });

  it("全部线路都在跑、没有晚点时才说全部线路运行正常", () => {
    const summary = statusSummary(
      build({
        trains: [train("SURC-MT-LP-1", "MT"), train("SURC-WS-1", "WS")],
        tripUpdates: new Map(),
      }),
    );

    expect(summary).toEqual({ text: "全部线路运行正常", state: "normal" });
  });

  it("夜里一列车都没有时写暂无运营列车，不说运行正常", () => {
    expect(statusSummary(build({ trains: [], tripUpdates: new Map() }))).toEqual({
      text: "暂无运营列车",
      state: "noTrains",
    });
  });

  it("部分线路没有列车时只说运行中的线路正常", () => {
    const summary = statusSummary(
      build({ trains: [train("SURC-MT-LP-1", "MT")], tripUpdates: new Map() }),
    );

    expect(summary).toEqual({ text: "运行中的线路均正常", state: "normal" });
  });

  it("读不到列车或行程更新时只能说没有停运与班次取消，不给图标", () => {
    expect(statusSummary(build({ trains: [train("SURC-MT-LP-1", "MT")] }))).toEqual({
      text: "暂无停运或班次取消",
    });
    expect(statusSummary(build({}))).toEqual({ text: "暂无停运或班次取消" });
  });
});
