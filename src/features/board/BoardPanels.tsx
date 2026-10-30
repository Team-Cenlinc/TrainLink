import { DepartureGroup } from "./DepartureGroup.tsx";
import type { PlatformGroup } from "./departures.ts";
import { LineView, type TrainSelect } from "./LineView.tsx";
import type { BoardData } from "./useBoardData.ts";
import styles from "./BoardPanels.module.css";

/**
 * 手机与大屏共用的两块内容：按站台的发车列表、单线列车位置。
 * 只处理读取中、出错、为空等状态，排版由外层布局决定。
 */

/**
 * 发车列表，每个站台一组。站台之间的间距由外层容器决定（className），
 * 手机上竖排，大屏发车区够宽时排成两栏。
 */
export function DepartureList({
  data,
  limit,
  groups = data.groups,
  className = styles.list,
}: {
  data: BoardData;
  limit: number;
  groups?: PlatformGroup[];
  className?: string;
}) {
  const { board } = data;
  if (board.isPending) return <p className={styles.message}>正在读取站牌…</p>;
  if (board.isError) {
    return (
      <div className={styles.message}>
        <p>站牌暂时无法读取。</p>
        <button type="button" className={styles.retry} onClick={() => board.refetch()}>
          重试
        </button>
      </div>
    );
  }
  if (groups.length === 0) return <p className={styles.message}>接下来暂无列车。</p>;
  return (
    <>
      <div className={className}>
        {groups.map((group) => (
          <DepartureGroup key={group.platform} group={group} limit={limit} />
        ))}
      </div>
      {board.data?.state === "partial" && (
        <p className={styles.note}>部分服务器暂时不可用，列表可能不完整。</p>
      )}
    </>
  );
}

/** 单线列车位置；点列车卡片打开详情。 */
export function LinePanel({
  data,
  onSelectTrain,
}: {
  data: BoardData;
  onSelectTrain?: TrainSelect;
}) {
  const { lineLayout, trains, gtfs, lineOrder, primaryLine } = data;
  if (lineLayout) {
    return (
      <LineView layout={lineLayout} lineColor={primaryLine?.color} onSelectTrain={onSelectTrain} />
    );
  }
  if (trains.isError || gtfs.isError) {
    return (
      <div className={styles.message}>
        <p>列车位置暂时无法读取。</p>
        <button
          type="button"
          className={styles.retry}
          onClick={() => {
            void trains.refetch();
            void gtfs.refetch();
          }}
        >
          重试
        </button>
      </div>
    );
  }
  if (gtfs.data && !lineOrder) return <p className={styles.message}>暂无这条线路的站序数据。</p>;
  return <p className={styles.message}>正在读取列车位置…</p>;
}
