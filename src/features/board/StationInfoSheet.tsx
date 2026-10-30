import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import CloseIcon from "@material-symbols/svg-400/outlined/keyboard_arrow_down.svg?react";
import OpenIcon from "@material-symbols/svg-400/outlined/arrow_outward.svg?react";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import type { RailStation, RailStationLine } from "@/lib/railApi.ts";
import { StationName } from "./StationHeader.tsx";
import styles from "./StationInfoSheet.module.css";

/** 某条线路在本站各站台的去向，例如「站台 1 往绿洲农场」。 */
export interface PlatformDirection {
  platform: string;
  destinations: string[];
}

interface StationInfoSheetProps {
  open: boolean;
  onClose: () => void;
  station?: RailStation;
  stationCode: string;
  lines: RailStationLine[];
  platforms: PlatformDirection[];
  transfers: RailStationLine[];
  /** 本站不能换乘时，沿线最近的换乘站。 */
  nearest?: { stop: RailStation; lines: RailStationLine[]; distance: number };
  mapUrl?: string;
}

const transferTypeLabel: Record<string, string> = {
  IN_STATION: "站内换乘",
  OUT_OF_STATION: "出站换乘",
};

/**
 * 车站信息面板：停靠线路与站台去向、换乘、所在位置与地图。
 * 模态面板：背景压暗；点压暗区域、按 Esc、点收起按钮或向下甩动都会关闭，关闭后焦点回到打开它的按钮。
 * 通过 portal 渲染到 body：看板页面是 position: fixed，会形成自己的层叠上下文，
 * 面板留在里面就盖不过浮动标签栏。
 */
export function StationInfoSheet(props: StationInfoSheetProps) {
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion
    ? { duration: 0 }
    : ({ type: "spring", bounce: 0, duration: 0.4 } as const);

  return createPortal(
    <AnimatePresence>
      {props.open && (
        <>
          <motion.div
            key="scrim"
            className={styles.scrim}
            onClick={props.onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
          />
          <motion.section
            key="sheet"
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby="station-info-title"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={transition}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) props.onClose();
            }}
          >
            <SheetContent {...props} />
          </motion.section>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function SheetContent({
  onClose,
  station,
  stationCode,
  lines,
  platforms,
  transfers,
  nearest,
  mapUrl,
}: StationInfoSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // 打开时把焦点移到收起按钮，关闭时还给之前的元素；Esc 关闭。
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  const position = station?.position;

  return (
    <>
      <div className={styles.grabber} aria-hidden />
      <header className={styles.header}>
        <h2 id="station-info-title" className={styles.title}>
          <StationName name={station?.name ?? stationCode} />
        </h2>
        <span className={styles.number}>{stationCode}</span>
        <button
          ref={closeRef}
          type="button"
          className={styles.close}
          aria-label="收起"
          onClick={onClose}
        >
          <CloseIcon aria-hidden />
        </button>
      </header>

      <Section title="停靠线路">
        {lines.map((line) => (
          <div key={line.lineId} className={styles.row}>
            <ServiceBadge lineCode={line.lineCode} lineColor={line.color} />
            <div className={styles.text}>
              <span className={styles.primary}>{line.lineName}</span>
              {platforms.length > 0 && (
                <span className={styles.secondary}>
                  {platforms
                    .map((p) => `站台 ${p.platform} 往${p.destinations.slice(0, 2).join("、")}`)
                    .join(" · ")}
                </span>
              )}
            </div>
          </div>
        ))}
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <div className={styles.card}>{children}</div>
    </section>
  );
}
