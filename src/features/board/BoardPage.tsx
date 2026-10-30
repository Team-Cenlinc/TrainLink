import { useCallback, useState } from "react";
import { useLayout } from "@/lib/useLayout.ts";
import { CompactBoard, type BoardView } from "./CompactBoard.tsx";
import { StationInfoSheet } from "./StationInfoSheet.tsx";
import { useBoardData } from "./useBoardData.ts";
import { WideBoard } from "./WideBoard.tsx";

/**
 * 看板：打开 App 首先看到的本站页。按可用宽度选择布局：
 * 手机用可拖动的面板（CompactBoard），平板与桌面把内容铺开成两栏或三栏（WideBoard）。
 * 数据只读一份（useBoardData），两种布局共用。
 */
export function BoardPage() {
  const layout = useLayout();
  const [view, setView] = useState<BoardView>("station");
  const [infoOpen, setInfoOpen] = useState(false);
  // 关闭函数保持同一个引用：车站信息的 effect 依赖它，否则每次刷新站牌都会重置焦点。
  const closeInfo = useCallback(() => setInfoOpen(false), []);
  const openInfo = useCallback(() => setInfoOpen(true), []);

  // 大屏一直显示列车位置；手机只在「线路」视图读取。
  const data = useBoardData(layout !== "compact" || view === "line");

  return (
    <>
      {layout === "compact" ? (
        <CompactBoard data={data} view={view} onViewChange={setView} onInfo={openInfo} />
      ) : (
        <WideBoard data={data} layout={layout} onInfo={openInfo} />
      )}

      <StationInfoSheet
        variant={layout === "compact" ? "sheet" : "popover"}
        open={infoOpen}
        onClose={closeInfo}
        station={data.station}
        stationCode={data.home.stationCode}
        lines={data.lines}
        platforms={data.groups.map((g) => ({ platform: g.platform, destinations: g.destinations }))}
        transfers={data.transfers}
        nearest={data.nearest}
        mapUrl={data.mapUrl}
      />
    </>
  );
}
