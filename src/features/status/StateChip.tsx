import type { ComponentType, SVGProps } from "react";
import BlockIcon from "@material-symbols/svg-400/outlined/block.svg?react";
import CheckIcon from "@material-symbols/svg-400/outlined/check_circle.svg?react";
import RemoveIcon from "@material-symbols/svg-400/outlined/remove.svg?react";
import ScheduleIcon from "@material-symbols/svg-400/outlined/schedule.svg?react";
import WarningIcon from "@material-symbols/svg-400/outlined/warning.svg?react";
import { stateText, type LineState, type LineStatus } from "./networkStatus.ts";
import styles from "./StateChip.module.css";

/** 每种状态的图标：停运「禁止」、班次取消「警告」、晚点「时钟」、正常「对勾」、无列车「短横」。 */
export const stateIcon: Record<LineState, ComponentType<SVGProps<SVGSVGElement>>> = {
  suspended: BlockIcon,
  reduced: WarningIcon,
  delayed: ScheduleIcon,
  normal: CheckIcon,
  noTrains: RemoveIcon,
};

/** 实底标签的底色；正常与无列车不加底色，免得一整页都是标签。 */
const chipTone: Partial<Record<LineState, string>> = {
  suspended: styles.severe,
  delayed: styles.severe,
  reduced: styles.caution,
};

/**
 * 线路状态标签，与发车列表里的晚点标签同一写法（PIDS 状态色实底、浅色字），前面加状态图标：
 * 停运红，班次取消琥珀，晚点红（线路晚点的门槛是 5 分钟，本来就是严重晚点）。
 * 正常用绿色文字、暂无列车用灰色文字，同样带图标。
 */
export function StateChip({ status, short = false }: { status: LineStatus; short?: boolean }) {
  const text =
    short && status.state === "delayed" ? `晚点 ${status.maxDelayMinutes} 分` : stateText(status);
  const Icon = stateIcon[status.state];
  const tone = chipTone[status.state];
  const className = tone
    ? `${styles.chip} ${tone}`
    : `${styles.text} ${status.state === "normal" ? styles.ok : ""}`;
  return (
    <span className={className}>
      <Icon aria-hidden />
      {text}
    </span>
  );
}
