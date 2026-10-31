import type { CSSProperties } from "react";
import { useNavigate } from "react-router";
import InfoIcon from "@material-symbols/svg-400/outlined/info.svg?react";
import SearchIcon from "@material-symbols/svg-400/outlined/search.svg?react";
import StarIcon from "@material-symbols/svg-400/outlined/star.svg?react";
import { fallbackLineColor, onLineColor } from "@/lib/lineColor.ts";
import type { Layout } from "@/lib/useLayout.ts";
import { formatClock } from "@/lib/time.ts";
import { StatusNotice } from "@/features/status/StatusNotice.tsx";
import { DepartureList, LinePanel } from "./BoardPanels.tsx";
import { LineDirections, LineSwitcher, type TrainSelect } from "./LineView.tsx";
import { StationName, StationTags } from "./StationHeader.tsx";
import type { PanelOpener } from "./BoardPage.tsx";
import type { BoardData } from "./useBoardData.ts";
import styles from "./WideBoard.module.css";

interface WideBoardProps {
  data: BoardData;
  layout: Exclude<Layout, "compact">;
  onInfo: PanelOpener;
  onPickStation: PanelOpener;
  onChooseLine: (lineCode: string) => void;
  onSelectTrain: TrainSelect;
}

/**
 * 大屏布局（宽度 ≥ 768），把手机上要拖动才能看到的内容同时铺开，不再需要面板拖动：
 * - 顶部整块线路色：常用车站、搜索「去哪里」、车站信息、大站名与当前时刻。
 *   不再放前后站线路条：右侧的列车位置已经画出整条线。
 * - 下面两块：左边本站发车，右边列车位置（固定宽度）。发车区够宽（≥ 700）时按方向分成两栏，
 *   否则一栏；由实际可用宽度决定（容器查询），不按设备名猜，任何宽度都不挤。各块独立滚动。
 */
export function WideBoard({
  data,
  layout,
  onInfo,
  onPickStation,
  onChooseLine,
  onSelectTrain,
}: WideBoardProps) {
  const navigate = useNavigate();
  const { home, stationName, lines, primaryLine, lineLayout, trains, timeZone } = data;
  const isTransfer = lines.length > 1;
  const color = isTransfer ? fallbackLineColor : (primaryLine?.color ?? fallbackLineColor);
  const style = { "--line": color, "--on-line": onLineColor(color) } as CSSProperties;

  return (
    <div className={`${styles.page} ${styles[layout]}`} style={style}>
      <header className={styles.hero}>
        <div className={styles.topbar}>
          <button type="button" className={styles.textButton} onClick={onPickStation}>
            <StarIcon aria-hidden />
            常用车站
          </button>
          <button type="button" className={styles.search} onClick={() => navigate("/trip?pick=to")}>
            <SearchIcon aria-hidden />从{stationName}去哪里？
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="车站信息"
            onClick={onInfo}
          >
            <InfoIcon aria-hidden />
          </button>
        </div>

        <div className={styles.title}>
          <h1 className={styles.name}>
            <StationName name={stationName} />
          </h1>
          <div className={styles.tagsRow}>
            <StationTags lines={lines} stationCode={home.stationCode} />
            <span className={styles.clock}>
              现在 <span className="num">{formatClock(data.now, timeZone)}</span>
            </span>
          </div>
        </div>
      </header>

      <main className={styles.panel}>
        <section className={`${styles.column} ${styles.departures}`} aria-label="本站发车">
          <StatusNotice stationLineCodes={data.lines.map((l) => l.lineCode)} />
          <DepartureList data={data} limit={layout === "wide" ? 6 : 4} className={styles.groups} />
        </section>

        <section className={`${styles.column} ${styles.lineColumn}`} aria-label="列车位置">
          <div className={styles.lineHead}>
            <h2 className={styles.lineTitle}>
              列车位置<span>{primaryLine?.lineName}</span>
            </h2>
            <LineSwitcher
              lines={data.orderedLines}
              value={primaryLine?.lineCode}
              onChange={onChooseLine}
            />
            {lineLayout && (
              <LineDirections
                first={lineLayout.stops[0]?.name}
                last={lineLayout.stops[lineLayout.stops.length - 1]?.name}
                lineColor={primaryLine?.color}
                updated={
                  trains.dataUpdatedAt ? formatClock(trains.dataUpdatedAt, timeZone) : undefined
                }
              />
            )}
          </div>
          <LinePanel data={data} onSelectTrain={onSelectTrain} />
        </section>
      </main>
    </div>
  );
}
