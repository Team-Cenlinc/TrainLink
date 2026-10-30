import { useState } from "react";
import ScheduleIcon from "@material-symbols/svg-400/outlined/schedule.svg?react";
import { Segmented } from "@/components/Segmented.tsx";
import { readHomeStation } from "@/lib/homeStation.ts";
import { useBoard, useCatalog, useNow } from "@/lib/queries.ts";
import { sourceTimeZone } from "@/lib/railApi.ts";
import { formatClock } from "@/lib/time.ts";
import { DepartureGroup } from "./DepartureGroup.tsx";
import { groupByPlatform } from "./departures.ts";
import { StationHeader } from "./StationHeader.tsx";
import styles from "./BoardPage.module.css";

type BoardView = "station" | "line";

const viewOptions = [
  { value: "station", label: "车站" },
  { value: "line", label: "线路" },
] as const;

/**
 * 看板：打开 App 首先看到的本站页。
 * 上方是整块线路色标题，下方面板叠在色块上，可在「车站」（按站台的发车）与「线路」（列车位置）之间切换。
 */
export function BoardPage() {
  // useState 的初始化函数只在第一次渲染时执行，避免每次渲染都读 localStorage。
  const [home] = useState(readHomeStation);
  const [view, setView] = useState<BoardView>("station");
  const now = useNow();
  const catalog = useCatalog();
  const board = useBoard(home);

  const operatorId = catalog.data?.operators.find(
    (o) => o.serverId === home.serverId && o.code === home.operatorCode,
  )?.id;
  const station = catalog.data?.stations.find(
    (s) =>
      s.serverId === home.serverId && s.operatorId === operatorId && s.code === home.stationCode,
  );
  const timeZone = sourceTimeZone(board.data, home.serverId);
  const groups = board.data
    ? groupByPlatform(board.data.departures, {
        serverId: home.serverId,
        now,
        timeZone,
        catalog: catalog.data,
      })
    : [];

  return (
    <div className={styles.page}>
      <StationHeader
        name={station?.name ?? home.stationCode}
        stationCode={home.stationCode}
        lines={station?.lines ?? []}
      />

      <main className={styles.sheet}>
        <div className={styles.grabber} aria-hidden />
        <div className={styles.controls}>
          <Segmented label="看板视图" options={viewOptions} value={view} onChange={setView} />
          <span className={styles.now}>
            <ScheduleIcon aria-hidden />
            <span className="num">{formatClock(now, timeZone)}</span>
          </span>
        </div>

        {view === "line" ? (
          <p className={styles.message}>单线列车位置正在制作中。</p>
        ) : board.isPending ? (
          <p className={styles.message}>正在读取站牌…</p>
        ) : board.isError ? (
          <div className={styles.message}>
            <p>站牌暂时无法读取。</p>
            <button type="button" className={styles.retry} onClick={() => board.refetch()}>
              重试
            </button>
          </div>
        ) : groups.length === 0 ? (
          <p className={styles.message}>接下来暂无列车。</p>
        ) : (
          groups.map((group) => <DepartureGroup key={group.platform} group={group} />)
        )}

        {board.data?.state === "partial" && (
          <p className={styles.note}>部分服务器暂时不可用，列表可能不完整。</p>
        )}
      </main>
    </div>
  );
}
