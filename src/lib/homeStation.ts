/**
 * 「本站」：打开 App 时首先显示的车站。
 * 暂存在浏览器本地；设置页完成后由用户选择，默认是蒲塘桥（PTK）。
 */
export interface HomeStation {
  serverId: string;
  operatorCode: string;
  stationCode: string;
}

const storageKey = "trainlink.homeStation";

export const defaultHomeStation: HomeStation = {
  serverId: "survival",
  operatorCode: "SURC",
  stationCode: "PTK",
};

/** 读取本站。隐私模式或存储被禁用时 localStorage 可能抛错，此时退回默认值。 */
export function readHomeStation(): HomeStation {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<HomeStation>;
      if (parsed.serverId && parsed.operatorCode && parsed.stationCode) {
        return parsed as HomeStation;
      }
    }
  } catch {
    // 忽略：使用默认本站。
  }
  return defaultHomeStation;
}
