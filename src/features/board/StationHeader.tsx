import {
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type PointerEvent,
  type Ref,
} from "react";
import { motion, useTransform, type MotionValue } from "motion/react";
import ForkIcon from "@material-symbols/svg-400/outlined/fork_right.svg?react";
import InfoIcon from "@material-symbols/svg-400/outlined/info.svg?react";
import OpenIcon from "@material-symbols/svg-400/outlined/arrow_outward.svg?react";
import SearchIcon from "@material-symbols/svg-400/outlined/search.svg?react";
import StarIcon from "@material-symbols/svg-400/outlined/star.svg?react";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import { fallbackLineColor, onLineColor } from "@/lib/lineColor.ts";
import { useTopColor } from "@/lib/useTopColor.ts";
import type { RailStation, RailStationLine } from "@/lib/railApi.ts";
import { useSettings } from "@/lib/settings.ts";
import type { StripStop } from "@/lib/station.ts";
import type { PanelOpener } from "./BoardPage.tsx";
import { useShown } from "./useShown.ts";
import styles from "./StationHeader.module.css";

interface StationHeaderProps {
  station?: RailStation;
  stationCode: string;
  /** 本站停靠的线路。 */
  lines: RailStationLine[];
  /** 下拉后显示的前后站；没有站序数据时为空。 */
  strip: StripStop[];
  /** 换乘站每条能画的线各一条前后站条；不止一条时横向滑动切换。 */
  strips: LineStripPage[];
  /** 选中的线路（运营方:线路码），前后站条与色带都显示它。 */
  currentLine?: string;
  /** 滑到或点了另一条线。 */
  onChooseLine: (line: string) => void;
  mapUrl?: string;
  /** 服务器当前时刻，例如 22:18；和发车行的时刻同一时区。 */
  clock: string;
  onInfo: PanelOpener;
  /** 「常用车站」：打开车站选择。 */
  onPickStation: PanelOpener;
  /** 右上角🔍：打开车站选择并聚焦搜索框。 */
  onSearchStation: PanelOpener;
  /** 在色块上按下即开始拖动面板（下拉）。 */
  onDragStart: (event: PointerEvent) => void;
  /** 面板从默认推上的进度（0–1）。 */
  up: MotionValue<number>;
  /** 面板从默认下拉的进度（0–1）。 */
  down: MotionValue<number>;
  titleRef: Ref<HTMLDivElement>;
  contextRef: Ref<HTMLDivElement>;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * 把进度的一段 [start, end] 换成「出现」：不透明度 0 → 1，同时从下方 rise 像素升到原位。
 * 几个元素用错开的区间，就得到跟着手指走的依次出现，而不是按时间播放的 stagger。
 */
function useReveal(progress: MotionValue<number>, start: number, end: number, rise = 12) {
  const opacity = useTransform(progress, (p) => clamp01((p - start) / (end - start)));
  const y = useTransform(opacity, (o) => (1 - o) * rise);
  return { opacity, y };
}

/**
 * 本站标题：整块线路色，铺满面板后方。默认只露出站名与编号（学 TrainTime，不加线路装饰）；
 * 面板下拉后，色块里平时隐藏的「车站周围」信息才露出来：线路名、前后站、换乘与地图。
 * 单线车站用线路色；换乘站用中性深色加等分色带，避免某条线的色牌在同色底上看不见。
 *
 * 动效（全部由面板位置驱动）：
 * - 推上：大站名比面板慢地向上漂移、略微缩小，并在前 60% 行程内淡出；工具栏在前 45% 内淡出，
 *   把位置让给收起的标题栏（见 CompactBar），两者不同时出现。
 * - 下拉：线路名、线路条、地图行按顺序依次升起出现。
 */
export function StationHeader({
  station,
  stationCode,
  lines,
  strip,
  strips,
  currentLine,
  onChooseLine,
  mapUrl,
  clock,
  onInfo,
  onPickStation,
  onSearchStation,
  onDragStart,
  up,
  down,
  titleRef,
  contextRef,
}: StationHeaderProps) {
  const isTransfer = lines.length > 1;
  const color = isTransfer ? fallbackLineColor : (lines[0]?.color ?? fallbackLineColor);
  // 状态栏与色块同色（见 useTopColor）；车站数据还没到时不改，免得先把默认深色交给 iOS。
  useTopColor(station ? color : undefined);
  const style = { "--line": color, "--on-line": onLineColor(color) } as CSSProperties;
  const position = station?.position;
  // 不止一条线能画前后站条时，下拉后的线路名换成一排线路按钮，前后站条也能横向滑动切换。
  const swipeable = strips.length > 1;

  const titleOpacity = useTransform(up, (p) => 1 - clamp01(p / 0.6));
  const titleY = useTransform(up, (p) => p * -28);
  const titleScale = useTransform(up, (p) => 1 - 0.06 * p);
  const toolbarOpacity = useTransform(up, (p) => 1 - clamp01(p / 0.45));
  const toolbarY = useTransform(up, (p) => p * -8);
  const lineNameReveal = useReveal(down, 0.05, 0.55);
  const stripReveal = useReveal(down, 0.2, 0.75);
  const mapReveal = useReveal(down, 0.35, 0.9);
  // 完全淡出后的工具栏与地图链接设为 inert（见 useShown），与上面的不透明度区间一致。
  const toolbarShown = useShown(up, (p) => p < 0.45);
  const mapShown = useShown(down, (p) => p > 0.35);
  // 换乘站的线路按钮与可横向滚动的前后站条也一样：面板盖着时不能用 Tab 键聚焦进去。
  const chipsShown = useShown(down, (p) => p > 0.05);
  const stripsShown = useShown(down, (p) => p > 0.2);

  return (
    <header className={styles.header} style={style} onPointerDown={onDragStart}>
      <motion.div
        className={styles.toolbar}
        style={{ opacity: toolbarOpacity, y: toolbarY }}
        inert={!toolbarShown}
      >
        <button type="button" className={styles.textButton} onClick={onPickStation}>
          <StarIcon aria-hidden />
          常用车站
        </button>
        <span className={styles.actions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="搜索车站"
            onClick={onSearchStation}
          >
            <SearchIcon aria-hidden />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="车站信息"
            onClick={onInfo}
          >
            <InfoIcon aria-hidden />
          </button>
        </span>
      </motion.div>

      <motion.div
        ref={titleRef}
        className={styles.title}
        style={{ opacity: titleOpacity, y: titleY, scale: titleScale }}
      >
        <h1 className={styles.name}>
          <StationName name={station?.name ?? stationCode} />
        </h1>
        <div className={styles.tagsRow}>
          <StationTags lines={lines} stationCode={stationCode} />
          <span className={styles.clock}>
            现在 <span className="num">{clock}</span>
          </span>
        </div>
        {isTransfer && (
          <div className={styles.band} aria-hidden>
            {lines.map((line) => (
              <span key={line.lineId} style={{ background: line.color ?? fallbackLineColor }} />
            ))}
          </div>
        )}
      </motion.div>

      <div ref={contextRef} className={styles.context}>
        {lines.length === 1 && lines[0] && (
          <motion.p className={styles.lineName} style={lineNameReveal}>
            {lines[0].lineName}
          </motion.p>
        )}
        {swipeable ? (
          <>
            <motion.div style={lineNameReveal} inert={!chipsShown}>
              <LineChips strips={strips} current={currentLine} onChoose={onChooseLine} />
            </motion.div>
            <motion.div style={stripReveal} inert={!stripsShown}>
              <LineStrips strips={strips} current={currentLine} onChoose={onChooseLine} />
            </motion.div>
          </>
        ) : (
          strip.length > 0 && (
            <motion.div style={stripReveal}>
              <LineStrip stops={strip} />
            </motion.div>
          )
        )}
        {mapUrl && position && (
          <motion.div className={styles.mapRow} style={mapReveal} inert={!mapShown}>
            <a className={styles.mapButton} href={mapUrl} target="_blank" rel="noreferrer">
              在地图中查看
              <OpenIcon aria-hidden />
            </a>
            <span className={`${styles.coords} num`}>
              {station?.world} · X {Math.round(position.x)} Z {Math.round(position.z)}
            </span>
          </motion.div>
        )}
      </div>
    </header>
  );
}

/** 站名只在「·」处换行。 */
export function StationName({ name }: { name: string }) {
  return name.split("·").map((part, i) => (
    <span key={i}>
      {i > 0 && (
        <>
          ·<wbr />
        </>
      )}
      {part}
    </span>
  ));
}

/**
 * 线路标签：底色同站名文字，线路码用线路色（镂空的样子，见样式）。站码默认不显示（对乘客用处不大），
 * 设置里打开后在最后单独加一个站码标签，换乘站也只显示一次。
 */
export function StationTags({
  lines,
  stationCode,
  className,
}: {
  lines: RailStationLine[];
  stationCode: string;
  className?: string;
}) {
  const { showStationCodes } = useSettings();
  return (
    <div className={`${styles.tags} ${className ?? ""}`}>
      {lines.map((line) => (
        <span
          key={line.lineId}
          className={styles.tag}
          style={{ "--tag-line": line.color ?? fallbackLineColor } as CSSProperties}
        >
          {line.lineCode}
        </span>
      ))}
      {showStationCodes && <span className={`${styles.tag} ${styles.code}`}>{stationCode}</span>}
    </div>
  );
}

export interface LineStripPage {
  /** 运营方:线路码。 */
  key: string;
  line: RailStationLine;
  stops: StripStop[];
}

/**
 * 换乘站的线路按钮：一眼看出「这几条线能点」。没选中的只留色牌，选中的才展开写线路名，
 * 线路多也排得下（同运营方按钮的样子）；还放不下时这一排横向滑动，选中的那个自动滚进视野。
 */
function LineChips({
  strips,
  current,
  onChoose,
}: {
  strips: LineStripPage[];
  current?: string;
  onChoose: (line: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // 只横向滚这一排，不用 scrollIntoView：它会连带滚动外面的面板。展开有 0.2 秒过渡，等它展开完再量、再滚。
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const row = ref.current;
      const chip = row?.querySelector<HTMLElement>("[aria-pressed=true]");
      if (!row || !chip) return;
      // 滚到按钮离这一排的边缘留出内边距（与站名对齐的那段），第一个、最后一个正好滚到头。
      const { paddingLeft, paddingRight } = getComputedStyle(row);
      const box = row.getBoundingClientRect();
      const { left, right } = chip.getBoundingClientRect();
      const start = box.left + parseFloat(paddingLeft);
      const end = box.right - parseFloat(paddingRight);
      const by = left < start ? left - start : Math.max(0, right - end);
      if (by) row.scrollBy({ left: by, behavior: "smooth" });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [current]);

  return (
    <div
      ref={ref}
      className={`${styles.lineChips} no-scrollbar`}
      role="group"
      aria-label="前后车站显示哪条线"
    >
      {strips.map(({ key, line }) => {
        const selected = key === current;
        return (
          <button
            key={key}
            type="button"
            className={`${styles.lineChip} ${selected ? styles.selectedChip : ""}`}
            aria-pressed={selected}
            // 名字里带上看得见的线路码：语音控制说「点 MT」也能点到。
            aria-label={`${line.lineCode} ${line.lineName}`}
            onClick={() => onChoose(key)}
          >
            <ServiceBadge lineCode={line.lineCode} lineColor={line.color} size="s" />
            <span className={styles.chipName} aria-hidden>
              <span>{line.lineName}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 换乘站的前后站条：每条线一页，横向滑动切换（浏览器自己的滚动与吸附，惯性和回弹都是系统的）。
 * 色块上下拖动仍然拖面板：这一块只接管横向手势（touch-action: pan-x）。
 *
 * 只有用户自己滑（触摸、滚轮、方向键）停稳后才换选中的线路，站牌随之换成那一家。
 * 外面换了线路（线路按钮、运营方按钮、线路视图）时直接换到那一页：程序触发的滚动不算选择，
 * 不会在晚到的滚动停下时把刚选的线又改回去；也不用平滑滚动，免得被重新吸附打断、停在半路。
 */
function LineStrips({
  strips,
  current,
  onChoose,
}: {
  strips: LineStripPage[];
  current?: string;
  onChoose: (line: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const index = Math.max(
    0,
    strips.findIndex((s) => s.key === current),
  );
  const settle = useRef<number | undefined>(undefined);
  /** 这次滚动是用户自己滑的。 */
  const byUser = useRef(false);
  const latest = useRef({ strips, current, onChoose });
  latest.current = { strips, current, onChoose };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el?.clientWidth || Math.round(el.scrollLeft / el.clientWidth) === index) return;
    byUser.current = false;
    el.scrollTo({ left: index * el.clientWidth });
  }, [index]);

  useEffect(() => () => window.clearTimeout(settle.current), []);

  const onUser = () => {
    byUser.current = true;
  };
  const onScroll = () => {
    window.clearTimeout(settle.current);
    if (!byUser.current) return;
    settle.current = window.setTimeout(() => {
      const el = ref.current;
      const { strips, current, onChoose } = latest.current;
      if (!el?.clientWidth) return;
      byUser.current = false;
      const page = strips[Math.round(el.scrollLeft / el.clientWidth)];
      if (page && page.key !== current) onChoose(page.key);
    }, 120);
  };

  return (
    <div
      ref={ref}
      className={`${styles.pages} no-scrollbar`}
      onScroll={onScroll}
      onPointerDown={onUser}
      onWheel={onUser}
      onKeyDown={onUser}
      aria-label="各线路的前后车站"
    >
      {strips.map((page) => (
        <section key={page.key} className={styles.page} aria-label={page.line.lineName}>
          <LineStrip stops={page.stops} />
        </section>
      ))}
    </div>
  );
}

/**
 * 前后站线路条：白色线身加深色描边（官网 404 换乘指引的线路几何），本站圆点加大。
 * 站序来自 GTFS；本站在线路端点时只画一侧。
 */
export function LineStrip({ stops }: { stops: StripStop[] }) {
  return (
    <ol className={styles.strip} aria-label="前后车站">
      {stops.map((stop) => (
        <li key={stop.code} className={stop.current ? styles.current : undefined}>
          <span className={styles.dot} aria-hidden />
          <span className={styles.stopName}>{stop.name}</span>
          {stop.transfers.length > 0 && (
            <span className={styles.transfers} aria-label="可换乘">
              {stop.transfers.map((line) => (
                <ServiceBadge
                  key={line.lineId}
                  lineCode={line.lineCode}
                  lineColor={line.color}
                  size="s"
                />
              ))}
            </span>
          )}
          {stop.forks.length > 0 && (
            <span className={styles.fork}>
              <ForkIcon aria-hidden />
              <span>分往{stop.forks.join("、")}</span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
