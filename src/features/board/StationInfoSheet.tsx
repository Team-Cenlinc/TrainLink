import type { ReactNode } from "react";
import CollapseIcon from "@material-symbols/svg-400/outlined/keyboard_arrow_down.svg?react";
import CloseIcon from "@material-symbols/svg-400/outlined/close.svg?react";
import OpenIcon from "@material-symbols/svg-400/outlined/arrow_outward.svg?react";
import { Overlay } from "@/components/Overlay.tsx";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import type { RailStation, RailStationLine } from "@/lib/railApi.ts";
import { linePlatforms, type PlatformDirection, type PlatformGroup } from "./departures.ts";
import { StationName } from "./StationHeader.tsx";
import styles from "./StationInfoSheet.module.css";

interface StationInfoSheetProps {
  open: boolean;
  onClose: () => void;
  station?: RailStation;
  stationCode: string;
  lines: RailStationLine[];
  /** 本站站牌按站台的分组；每条线路只列出自己的站台。 */
  groups: PlatformGroup[];
  transfers: RailStationLine[];
  /** 本站不能换乘时，沿线最近的换乘站。 */
  nearest?: { stop: RailStation; lines: RailStationLine[]; distance: number };
  mapUrl?: string;
  /** 手机为底部面板，大屏为从按钮处展开的弹出卡片（见 Overlay）。 */
  variant: "sheet" | "popover";
  /** 弹出卡片的触发按钮位置。 */
  anchor?: DOMRect;
}

const transferTypeLabel: Record<string, string> = {
  IN_STATION: "站内换乘",
  OUT_OF_STATION: "出站换乘",
};

/** 车站信息：停靠线路与站台去向、换乘、所在位置与地图。 */
export function StationInfoSheet(props: StationInfoSheetProps) {
  return (
    <Overlay
      open={props.open}
      onClose={props.onClose}
      variant={props.variant}
      anchor={props.anchor}
      labelledBy="station-info-title"
    >
      <SheetContent {...props} />
    </Overlay>
  );
}

function SheetContent({
  onClose,
  station,
  stationCode,
  lines,
  groups,
  transfers,
  nearest,
  mapUrl,
  variant,
}: StationInfoSheetProps) {
  const position = station?.position;

  return (
    <>
      <header className={styles.header}>
        <h2 id="station-info-title" className={styles.title}>
          <StationName name={station?.name ?? stationCode} />
        </h2>
        <span className={styles.number}>{stationCode}</span>
        <button
          data-autofocus
          type="button"
          className={styles.close}
          aria-label={variant === "popover" ? "关闭" : "收起"}
          onClick={onClose}
        >
          {/* 底部面板向下收起；弹出卡片直接关闭。 */}
          {variant === "popover" ? <CloseIcon aria-hidden /> : <CollapseIcon aria-hidden />}
        </button>
      </header>

      <Section title="停靠线路">
        {lines.map((line) => {
          const platforms = linePlatforms(groups, line.lineCode);
          return (
            <div key={line.lineId} className={styles.row}>
              <ServiceBadge lineCode={line.lineCode} lineColor={line.color} />
              <div className={styles.text}>
                <span className={styles.primary}>{line.lineName}</span>
                {platforms.length > 0 && (
                  <span className={styles.secondary}>
                    {platforms.map(platformText).join(" · ")}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </Section>

      <Section title="换乘">
        <div className={styles.row}>
          <div className={styles.text}>
            {transfers.length > 0 ? (
              <>
                <span className={styles.primary}>可换乘 {transfers.length} 条线路</span>
                <span className={styles.secondary}>
                  {transfers
                    .map(
                      (l) =>
                        `${l.lineName}（${transferTypeLabel[l.transferType ?? ""] ?? "换乘"}）`,
                    )
                    .join("、")}
                </span>
              </>
            ) : (
              <>
                <span className={styles.primary}>本站不能换乘</span>
                {nearest && (
                  <span className={styles.secondary}>
                    {nearest.distance === 1 ? "下一站" : `相隔 ${nearest.distance} 站的`}
                    {nearest.stop.name}可换乘
                    {nearest.lines[0]?.viaStationCode ? "，需出站" : ""}
                  </span>
                )}
              </>
            )}
          </div>
          <span className={styles.badges}>
            {(transfers.length > 0 ? transfers : (nearest?.lines ?? [])).map((l) => (
              <ServiceBadge key={l.lineId} lineCode={l.lineCode} lineColor={l.color} size="s" />
            ))}
          </span>
        </div>
      </Section>

      {position && (
        <Section title="位置">
          <div className={styles.row}>
            <div className={styles.text}>
              <span className={styles.primary}>{station?.world} 世界</span>
              <span className={`${styles.secondary} num`}>
                X {Math.round(position.x)} · Y {Math.round(position.y)} · Z {Math.round(position.z)}
              </span>
            </div>
          </div>
        </Section>
      )}

      {mapUrl && (
        <a className={styles.mapButton} href={mapUrl} target="_blank" rel="noreferrer">
          <OpenIcon aria-hidden />
          在地图中查看
        </a>
      )}
    </>
  );
}

/** 「站台 1 往绿洲农场」；只有终到列车的站台与看板一致，写「本站终到」。 */
function platformText({ platform, destinations }: PlatformDirection) {
  return destinations.length > 0
    ? `站台 ${platform} 往${destinations.slice(0, 2).join("、")}`
    : `站台 ${platform} 本站终到`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <div className={styles.card}>{children}</div>
    </section>
  );
}
