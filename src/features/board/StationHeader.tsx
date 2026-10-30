import type { CSSProperties } from "react";
import MoreIcon from "@material-symbols/svg-400/outlined/more_horiz.svg?react";
import NearMeIcon from "@material-symbols/svg-400/outlined/near_me.svg?react";
import StarIcon from "@material-symbols/svg-400/outlined/star.svg?react";
import { fallbackLineColor, onLineColor } from "@/lib/lineColor.ts";
import type { RailStationLine } from "@/lib/railApi.ts";
import styles from "./StationHeader.module.css";

interface StationHeaderProps {
  name: string;
  stationCode: string;
  lines: RailStationLine[];
}

/**
 * 本站标题：学 TrainTime，整块纯色，只放站名和编号标签，不加线路装饰。
 * 单线车站用线路色；换乘站用中性深色，底部按线路等分色带，避免某条线的色牌在同色底上看不见。
 */
export function StationHeader({ name, stationCode, lines }: StationHeaderProps) {
  const isTransfer = lines.length > 1;
  const color = isTransfer ? fallbackLineColor : (lines[0]?.color ?? fallbackLineColor);
  const style = { "--line": color, "--on-line": onLineColor(color) } as CSSProperties;

  return (
    <header className={styles.header} style={style}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.textButton}>
          <StarIcon aria-hidden />
          常用车站
        </button>
        <div className={styles.actions}>
          <button type="button" className={styles.iconButton} aria-label="附近车站">
            <NearMeIcon aria-hidden />
          </button>
          <button type="button" className={styles.iconButton} aria-label="更多">
            <MoreIcon aria-hidden />
          </button>
        </div>
      </div>

      <h1 className={styles.name}>
        {name.split("·").map((part, i) => (
          <span key={i}>
            {i > 0 && (
              <>
                ·<wbr />
              </>
            )}
            {part}
          </span>
        ))}
      </h1>

      <div className={styles.tags}>
        {lines.map((line) => (
          <span
            key={line.lineId}
            className={styles.tag}
            style={{ "--tag-line": line.color ?? fallbackLineColor } as CSSProperties}
          >
            <span className={styles.tagLine}>{line.lineCode}</span>
            {stationCode}
          </span>
        ))}
      </div>

      {isTransfer && (
        <div className={styles.band} aria-hidden>
          {lines.map((line) => (
            <span key={line.lineId} style={{ background: line.color ?? fallbackLineColor }} />
          ))}
        </div>
      )}
    </header>
  );
}
