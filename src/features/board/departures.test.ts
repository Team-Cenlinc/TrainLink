import { describe, expect, it } from "vitest";
import type { RailCatalog, RailDeparture } from "@/lib/railApi.ts";
import { groupByPlatform, linePlatforms, type BoardContext } from "./departures.ts";

const now = Date.UTC(2026, 9, 31, 1, 0);
const minute = 60_000;

const catalog: RailCatalog = {
  schemaVersion: 1,
  generatedAt: "",
  state: "healthy",
  sources: [],
  operators: [{ id: "survival:SURC", serverId: "survival", code: "SURC", name: "SURC" }],
  lines: [
    {
      id: "survival:SURC:MT",
      serverId: "survival",
      operatorId: "survival:SURC",
      code: "MT",
      name: "两港快线",
      color: "#D920D9",
      serviceType: "METRO",
      status: "ACTIVE",
    },
  ],
  stations: [
    { code: "PPK", name: "蒲塘桥港" },
    { code: "HHU", name: "新笛矢·壑湖" },
    { code: "NTA", name: "南渡" },
  ].map(({ code, name }) => ({
    id: `survival:SURC:${code}`,
    serverId: "survival",
    operatorId: "survival:SURC",
    code,
    name,
    lines: [],
  })),
};

const context: BoardContext = { serverId: "survival", now, timeZone: "Asia/Shanghai", catalog };

function departure(overrides: Partial<RailDeparture>): RailDeparture {
  return {
    line: "MT",
    routeId: "SURC:MT:MT-2F_Short",
    destination: "两港快线-蒲塘桥港",
    destinationId: "SURC:PPK",
    platform: "1",
    status: "",
    phase: "EN_ROUTE",
    etaEpochMillis: now + 3 * minute,
    passing: false,
    terminating: false,
    inService: true,
    train: "SURC-MT-LP-0001",
    ...overrides,
  };
}

describe("groupByPlatform", () => {
  it("按站台分组、站台号按数字排序，组内保持原来的时间顺序；通过不停的班次不显示", () => {
    const groups = groupByPlatform(
      [
        departure({ platform: "10", train: "a" }),
        departure({ platform: "2", train: "b", destinationId: "SURC:HHU" }),
        departure({ platform: "2", train: "c", passing: true }),
        departure({ platform: "2", train: "d", destinationId: "SURC:HHU" }),
      ],
      context,
    );
    expect(groups.map((g) => [g.platform, g.departures.map((d) => d.key)])).toEqual([
      ["2", ["train-b", "train-d"]],
      ["10", ["train-a"]],
    ]);
  });

  it("终点用 catalog 站名，查不到时用交路显示名；本站终到的班次不计入「往」的终点", () => {
    const [group] = groupByPlatform(
      [
        departure({ train: "a" }),
        departure({ train: "b", destinationId: "SURC:XXX", destination: "某交路" }),
        departure({ train: "c", terminating: true }),
      ],
      context,
    );
    expect(group?.destinations).toEqual(["蒲塘桥港", "某交路"]);
    expect(group?.departures.map((d) => d.destinationName)).toEqual([
      "蒲塘桥港",
      "某交路",
      "本站终到",
    ]);
  });

  it("站台待定时显示候选站台", () => {
    const [group] = groupByPlatform(
      [departure({ platform: "", platformPending: true, platformCandidates: ["1", "2"] })],
      context,
    );
    expect([group?.platform, group?.platformPending]).toEqual(["1/2", true]);
  });
});

describe("toDepartureView（经 groupByPlatform）", () => {
  const view = (d: Partial<RailDeparture>) =>
    groupByPlatform([departure(d)], context)[0]!.departures[0]!;

  it("分钟数向上取整，不足 1 分显示 1；时刻按服务器时区", () => {
    expect(view({ etaEpochMillis: now + 61_000 }).minutes).toBe(2);
    expect(view({ etaEpochMillis: now + 1_000 }).minutes).toBe(1);
    expect(view({ etaEpochMillis: now - 30_000 }).minutes).toBe(1);
    expect(view({ etaEpochMillis: now + 3 * minute }).clock).toBe("09:03");
    expect(view({ etaEpochMillis: undefined })).toMatchObject({ minutes: null, clock: null });
  });

  it("线路色按运营商与线路码查 catalog", () => {
    expect(view({}).lineColor).toBe("#D920D9");
  });

  it("种别：交路里带 Exp 的为快速", () => {
    expect(view({ routeId: "SURC:MT:MT-3N_DPExp" }).serviceType).toBe("快速");
    expect(view({}).serviceType).toBe("普通");
  });

  it("状态：晚点不足 5 分为一般，5 分及以上为严重；计划班次与还没有列车的预测班次为「计划」", () => {
    expect(view({ delaySeconds: 59 }).status).toEqual({ kind: "normal" });
    expect(view({ delaySeconds: 240 }).status).toEqual({
      kind: "delayed",
      minutes: 4,
      severe: false,
    });
    expect(view({ delaySeconds: 300 }).status).toEqual({
      kind: "delayed",
      minutes: 5,
      severe: true,
    });
    expect(view({ phase: "PLANNED" }).status).toEqual({ kind: "planned" });
    expect(view({ phase: "FORECAST", train: undefined }).status).toEqual({ kind: "planned" });
    expect(view({ phase: "ARRIVING", delaySeconds: 600 }).status).toEqual({ kind: "arriving" });
    expect(view({ phase: "DEPARTING" }).status).toEqual({ kind: "boarding" });
    expect(view({ phase: "CANCELLED" }).status).toEqual({ kind: "cancelled" });
  });

  it("已出车的班次用列车名做 key，没有列车时用交路与时刻", () => {
    expect(view({}).key).toBe("train-SURC-MT-LP-0001");
    expect(view({ train: undefined }).key).toBe(`SURC:MT:MT-2F_Short-${now + 3 * minute}`);
  });
});

describe("linePlatforms", () => {
  it("只列出这条线路用到的站台与它的去向", () => {
    const groups = groupByPlatform(
      [
        departure({ platform: "1", train: "a" }),
        departure({ platform: "2", train: "b", destinationId: "SURC:HHU" }),
        departure({ platform: "3", line: "WS", routeId: "SURC:WS:WS-2C", train: "c" }),
        departure({ platform: "3", line: "WS", destinationId: "SURC:NTA", train: "d" }),
      ],
      context,
    );
    expect(linePlatforms(groups, "MT")).toEqual([
      { platform: "1", destinations: ["蒲塘桥港"] },
      { platform: "2", destinations: ["新笛矢·壑湖"] },
    ]);
    expect(linePlatforms(groups, "WS")).toEqual([
      { platform: "3", destinations: ["蒲塘桥港", "南渡"] },
    ]);
  });

  it("站台上只有这条线的终到列车时，去向为空", () => {
    const groups = groupByPlatform(
      [
        departure({ platform: "1", train: "a", terminating: true }),
        departure({ platform: "1", line: "WS", train: "b" }),
      ],
      context,
    );
    expect(linePlatforms(groups, "MT")).toEqual([{ platform: "1", destinations: [] }]);
  });
});
