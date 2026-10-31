import { describe, expect, it } from "vitest";
import { defaultSettings, parseSettings, stationOnServer, toggleOperator } from "./settings.ts";

const operators = [
  { id: "s:a", serverId: "s", code: "SURC", name: "生存中部铁路" },
  { id: "s:b", serverId: "s", code: "PUAT", name: "蒲塘桥都会区交通" },
  { id: "c:x", serverId: "c", code: "CR", name: "创造铁路" },
];

describe("设置", () => {
  it("读取设置：缺少或不合法的字段用默认值，合法的字段保留", () => {
    expect(parseSettings(null)).toEqual(defaultSettings);
    expect(parseSettings("{")).toEqual(defaultSettings);
    expect(
      parseSettings(JSON.stringify({ theme: "dark", remindMinutes: 7, hiddenOperators: "x" })),
    ).toEqual({ ...defaultSettings, theme: "dark" });
    expect(
      parseSettings(JSON.stringify({ remindMinutes: 10, hiddenOperators: ["survival:PUAT"] })),
    ).toEqual({ ...defaultSettings, remindMinutes: 10, hiddenOperators: ["survival:PUAT"] });
  });

  it("站码默认不显示，只认布尔值", () => {
    expect(defaultSettings.showStationCodes).toBe(false);
    expect(parseSettings(JSON.stringify({ showStationCodes: true })).showStationCodes).toBe(true);
    expect(parseSettings(JSON.stringify({ showStationCodes: "yes" })).showStationCodes).toBe(false);
  });

  it("隐藏或重新显示运营方；同一台服务器上最后一家显示的不能隐藏", () => {
    const hidden = toggleOperator([], "s:b", operators);

    expect(hidden).toEqual(["s:b"]);
    expect(toggleOperator(hidden, "s:a", operators)).toEqual(["s:b"]);
    expect(toggleOperator(hidden, "s:b", operators)).toEqual([]);
    // 别的服务器上的运营方不算：c 上只有一家，也不能隐藏。
    expect(toggleOperator(hidden, "c:x", operators)).toEqual(["s:b"]);
  });

  it("切换服务器时的本站：这台服务器上的第一个常用车站；没有就用显示的运营方的第一个车站", () => {
    const station = (id: string, serverId: string, operatorId: string, code: string) => ({
      id,
      serverId,
      operatorId,
      code,
      name: code,
      lines: [],
    });
    const catalog = {
      operators,
      stations: [
        station("1", "s", "s:b", "ZZZ"),
        station("2", "s", "s:a", "PTK"),
        station("3", "c", "c:x", "SPN"),
      ],
    };
    const favorite = { serverId: "c", operatorCode: "CR", stationCode: "HUB" };

    expect(stationOnServer("c", [favorite], catalog, [])).toEqual(favorite);
    expect(stationOnServer("s", [favorite], catalog, ["s:b"])).toEqual({
      serverId: "s",
      operatorCode: "SURC",
      stationCode: "PTK",
    });
    expect(stationOnServer("x", [favorite], catalog, [])).toBeUndefined();
  });
});
