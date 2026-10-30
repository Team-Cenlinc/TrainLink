import type { CSSProperties } from "react";
import { useNavigate } from "react-router";
import InfoIcon from "@material-symbols/svg-400/outlined/info.svg?react";
import SearchIcon from "@material-symbols/svg-400/outlined/search.svg?react";
import StarIcon from "@material-symbols/svg-400/outlined/star.svg?react";
import { fallbackLineColor, onLineColor } from "@/lib/lineColor.ts";
import type { Layout } from "@/lib/useLayout.ts";
import { formatClock } from "@/lib/time.ts";
import { DepartureList, LinePanel } from "./BoardPanels.tsx";
import { LineDirections } from "./LineView.tsx";
import { LineStrip, StationName, StationTags } from "./StationHeader.tsx";
import type { BoardData } from "./useBoardData.ts";
import styles from "./WideBoard.module.css";

interface WideBoardProps {
  data: BoardData;
  layout: Exclude<Layout, "compact">;
  onInfo: () => void;
}

/**
 * 大屏布局，把手机上要拖动才能看到的内容同时铺开，不再需要面板拖动：
 * - 顶部整块线路色：搜索「去哪里」、车站信息、大站名与当前时刻，右侧是前后站线路条；
 * - 平板（600–1099）：两栏，左本站发车，右列车位置；
 * - 桌面（≥ 1100）：三栏，两个方向的发车各一栏，再加列车位置。各栏独立滚动。
 */
export function WideBoard({ data, layout, onInfo }: WideBoardProps) {
  const navigate = useNavigate();
  const { home, stationName, lines, primaryLine, groups, lineLayout, trains, timeZone } = data;
  const isTransfer = lines.length > 1;
  const color = isTransfer ? fallbackLineColor : (primaryLine?.color ?? fallbackLineColor);
  const style = { "--line": color, "--on-line": onLineColor(color) } as CSSProperties;

  // 桌面每个方向一栏；站台多于两个时，其余站台并入第二栏。
  const directionColumns =
    layout === "wide" && groups.length >= 2 ? [groups.slice(0, 1), groups.slice(1)] : [groups];

  return (
    <div className={`${styles.page} ${styles[layout]}`} style={style}>
      <header className={styles.hero}>
        <div className={styles.topbar}>
          <button type="button" className={styles.textButton}>
            <StarIcon aria-hidden />
            常用车站
          </button>
          <button type="button" className={styles.search} onClick={() => navigate("/trip")}>
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

        <div className={styles.titleRow}>
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
          {data.strip.length > 0 && (
            <div className={styles.strip}>
              <LineStrip stops={data.strip} />
            </div>
          )}
        </div>
      </header>

      <main className={styles.panel}>
        {directionColumns.map((columnGroups, i) => (
          <section key={i} className={styles.column} aria-label="本站发车">
            <DepartureList data={data} groups={columnGroups} limit={layout === "wide" ? 6 : 4} />
          </section>
        ))}

        <section className={`${styles.column} ${styles.lineColumn}`} aria-label="列车位置">
          <div className={styles.lineHead}>
            <h2 className={styles.lineTitle}>
              列车位置<span>{primaryLine?.lineName}</span>
            </h2>
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
          <LinePanel data={data} />
        </section>
      </main>
    </div>
  );
}
