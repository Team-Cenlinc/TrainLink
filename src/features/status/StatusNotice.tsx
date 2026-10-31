import { Link } from "react-router";
import ChevronIcon from "@material-symbols/svg-400/outlined/chevron_right.svg?react";
import { stationNotice } from "./networkStatus.ts";
import { StateChip } from "./StateChip.tsx";
import { useNetworkStatus } from "./useNetworkStatus.ts";
import styles from "./StatusNotice.module.css";

/**
 * 看板上的运行提示：本站线路有停运或班次取消时，在发车列表上方显示最严重的一项，
 * 点一下进入运行状态页。一切正常时不占位置。样式同发车卡片：白底大圆角。
 * 一行写「状态标签 线路名 说明」，状态只由标签表达一次，不再在文字里重复。
 *
 * 只用线路目录与通告，不为算晚点去读行程更新（每 15 秒一次）：
 * 本站班次的晚点在发车列表里已经用琥珀色标出，线路整体的晚点在运行状态页看。
 */
export function StatusNotice({ stationLineCodes }: { stationLineCodes: string[] }) {
  const { status } = useNetworkStatus(false);
  const notice = status && stationNotice(status, stationLineCodes);
  if (!notice) return null;
  return (
    <Link to="/status" className={styles.notice}>
      <StateChip status={notice.status} short />
      <span className={styles.text}>
        <span className={styles.lineName}>{notice.status.line.name}</span>
        {notice.detail && <span className={styles.detail}>{notice.detail}</span>}
      </span>
      {notice.more > 0 && <span className={styles.more}>另有 {notice.more} 项</span>}
      <ChevronIcon className={styles.chevron} aria-hidden />
    </Link>
  );
}
