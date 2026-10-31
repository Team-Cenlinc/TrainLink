import { useCallback, useState, type MouseEvent } from "react";
import { useHomeStation } from "@/lib/homeStation.ts";
import { useLayout } from "@/lib/useLayout.ts";
import { StationPicker } from "@/features/stations/StationPicker.tsx";
import { TrainSheet } from "@/features/train/TrainSheet.tsx";
import { useTrainDetail } from "@/features/train/useTrainDetail.ts";
import { CompactBoard, type BoardView } from "./CompactBoard.tsx";
import type { TrainSelect } from "./LineView.tsx";
import { StationInfoSheet } from "./StationInfoSheet.tsx";
import { useBoardData } from "./useBoardData.ts";
import { WideBoard } from "./WideBoard.tsx";

/**
 * 当前打开的面板：车站信息、车站选择或列车详情；
 * anchor 是触发按钮（或列车卡片）的位置，大屏弹出卡片据此定位。
 */
type OpenPanel =
  | { kind: "info" | "picker"; anchor?: DOMRect }
  | { kind: "train"; trainName: string; anchor?: DOMRect }
  | null;

/** 头部按钮的点击回调：带上事件，以便取得按钮位置。 */
export type PanelOpener = (event: MouseEvent<HTMLElement>) => void;

/**
 * 看板：打开 App 首先看到的本站页。按可用宽度选择布局：
 * 手机用可拖动的面板（CompactBoard），平板与桌面把内容铺开成两栏或三栏（WideBoard）。
 * 数据只读一份（useBoardData），两种布局共用。
 */
export function BoardPage() {
  const layout = useLayout();
  const [view, setView] = useState<BoardView>("station");
  const [panel, setPanel] = useState<OpenPanel>(null);
  // 回调保持同一个引用：面板的 effect 依赖 onClose，否则每次刷新站牌都会重置焦点。
  const closePanel = useCallback(() => setPanel(null), []);
  const openInfo = useCallback<PanelOpener>(
    (event) => setPanel({ kind: "info", anchor: event.currentTarget.getBoundingClientRect() }),
    [],
  );
  const openPicker = useCallback<PanelOpener>(
    (event) => setPanel({ kind: "picker", anchor: event.currentTarget.getBoundingClientRect() }),
    [],
  );
  const openTrain = useCallback<TrainSelect>(
    (trainName, anchor) => setPanel({ kind: "train", trainName, anchor }),
    [],
  );

  // 换乘站上选中的线路；记下是哪个车站选的，换了本站就自动回到默认线路。
  const home = useHomeStation();
  const homeKey = `${home.operatorCode}:${home.stationCode}`;
  const [lineChoice, setLineChoice] = useState<{ station: string; line: string }>();
  const chosenLine = lineChoice?.station === homeKey ? lineChoice.line : undefined;
  const chooseLine = useCallback(
    (line: string) => setLineChoice({ station: homeKey, line }),
    [homeKey],
  );

  // 大屏一直显示列车位置；手机只在「线路」视图读取。
  const data = useBoardData(layout !== "compact" || view === "line", chosenLine);
  const variant = layout === "compact" ? "sheet" : "popover";
  const train = useTrainDetail(data, panel?.kind === "train" ? panel.trainName : undefined);

  return (
    <>
      {layout === "compact" ? (
        <CompactBoard
          data={data}
          view={view}
          onViewChange={setView}
          onInfo={openInfo}
          onPickStation={openPicker}
          onChooseLine={chooseLine}
          onSelectTrain={openTrain}
        />
      ) : (
        <WideBoard
          data={data}
          layout={layout}
          onInfo={openInfo}
          onPickStation={openPicker}
          onChooseLine={chooseLine}
          onSelectTrain={openTrain}
        />
      )}

      <StationInfoSheet
        variant={variant}
        open={panel?.kind === "info"}
        anchor={panel?.anchor}
        onClose={closePanel}
        station={data.station}
        stationCode={data.home.stationCode}
        lines={data.lines}
        groups={data.groups}
        transfers={data.transfers}
        nearest={data.nearest}
        mapUrl={data.mapUrl}
      />
      <TrainSheet
        variant={variant}
        open={panel?.kind === "train"}
        anchor={panel?.anchor}
        onClose={closePanel}
        detail={train.detail}
        loading={train.loading}
        now={data.now}
        timeZone={data.timeZone}
      />
      <StationPicker
        variant={variant}
        open={panel?.kind === "picker"}
        anchor={panel?.anchor}
        onClose={closePanel}
      />
    </>
  );
}
