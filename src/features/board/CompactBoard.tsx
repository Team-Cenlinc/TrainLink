import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useNavigate } from "react-router";
import { motion, useReducedMotion, useTransform } from "motion/react";
import SearchIcon from "@material-symbols/svg-400/outlined/search.svg?react";
import { Segmented } from "@/components/Segmented.tsx";
import { formatClock } from "@/lib/time.ts";
import { StatusNotice } from "@/features/status/StatusNotice.tsx";
import { DepartureList, LinePanel } from "./BoardPanels.tsx";
import { CompactBar } from "./CompactBar.tsx";
import { LineDirections, LineSwitcher, type TrainSelect } from "./LineView.tsx";
import { StationHeader } from "./StationHeader.tsx";
import type { PanelOpener } from "./BoardPage.tsx";
import type { BoardData } from "./useBoardData.ts";
import { measureDetents, type Detents } from "./detents.ts";
import { useSheetDetents } from "./useSheetDetents.ts";
import styles from "./CompactBoard.module.css";

export type BoardView = "station" | "line";

const viewOptions = [
  { value: "station", label: "车站" },
  { value: "line", label: "线路" },
] as const;

/**
 * 每个方向显示的班次数。三档都相同：面板只移动、不换内容，拖动中途不会出现布局跳动；
 * 推上也不展开更远的班次，乘客关心的是接下来几班。
 */
const rowsShown = 4;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

interface CompactBoardProps {
  data: BoardData;
  view: BoardView;
  onViewChange: (view: BoardView) => void;
  onInfo: PanelOpener;
  onPickStation: PanelOpener;
  onSearchStation: PanelOpener;
  onChooseLine: (lineCode: string) => void;
  onSelectTrain: TrainSelect;
}

/**
 * 手机布局（宽度 < 768）：线路色块铺在后面，发车面板叠在上面，可以拖到三个位置：
 * 下拉露出车站周围信息；默认看大站名与最近几班；推上时大站名收进一行标题栏，面板占满屏幕。
 * 所有过渡都由面板位置直接驱动（跟手），不是按时间播放的动画。
 */
export function CompactBoard({
  data,
  view,
  onViewChange,
  onInfo,
  onPickStation,
  onSearchStation,
  onChooseLine,
  onSelectTrain,
}: CompactBoardProps) {
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const { home, station, stationName, lines, primaryLine, lineLayout, trains, timeZone } = data;

  // ---------- 面板三档：量出各档位置 ----------
  const titleRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [detents, setDetents] = useState<Detents | null>(null);

  useLayoutEffect(() => {
    // 用 offsetTop/offsetHeight（布局位置）而不是 getBoundingClientRect：
    // 标题会随拖动缩放、位移，那是视觉变换，不能影响各档位置。
    const bottomOf = (el: HTMLElement | null) => (el ? el.offsetTop + el.offsetHeight : undefined);
    const measure = () => {
      const titleBottom = bottomOf(titleRef.current) ?? 200;
      setDetents(
        measureDetents({
          barHeight: barRef.current?.offsetHeight ?? 64,
          titleBottom,
          contextBottom: bottomOf(contextRef.current) ?? titleBottom,
          viewportHeight: window.innerHeight,
        }),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const ref of [titleRef, contextRef, barRef])
      if (ref.current) observer.observe(ref.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const { y, detent, goTo, step, onDragEnd, dragControls } = useSheetDetents(detents);

  /*
   * 两个进度值把面板位置换算成 0–1，标题、标题栏、下拉内容都只读这两个值：
   * up：默认 → 推上（0 → 1）；down：默认 → 下拉（0 → 1）。
   * 转换函数读 ref，始终拿到最新量出的档位。
   */
  const detentsRef = useRef(detents);
  detentsRef.current = detents;
  // 矮屏上两档可能重合（见 measureDetents），这时那一段没有行程，进度固定为 0，不能除以 0。
  const progress = (distance: number, range: number) => (range > 0 ? clamp01(distance / range) : 0);
  const up = useTransform(y, (v) => {
    const d = detentsRef.current;
    return d ? progress(d.normal - v, d.normal - d.expanded) : 0;
  });
  const down = useTransform(y, (v) => {
    const d = detentsRef.current;
    return d ? progress(v - d.normal, d.peek - d.normal) : 0;
  });
  // 面板升到色块上方时阴影加深，表达它在色块之上。
  const sheetShadow = useTransform(up, (p) => `0 -10px 30px rgb(0 0 0 / ${(0.14 * p).toFixed(3)})`);

  // 拖动后浏览器仍会触发一次 click，用这个标记避免把拖动误当成点按拖动条。
  const dragged = useRef(false);
  const startDrag = useCallback(
    (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest("button, a")) return;
      dragged.current = false;
      dragControls.start(event);
    },
    [dragControls],
  );

  const onGrabberKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowUp") step(-1);
    else if (event.key === "ArrowDown") step(1);
    else return;
    event.preventDefault();
  };

  return (
    // data-fixed-page：整页固定不滚动，文档也锁住（见 global.css）。
    <div className={styles.page} data-fixed-page>
      <StationHeader
        station={station}
        stationCode={home.stationCode}
        lines={lines}
        strip={data.strip}
        mapUrl={data.mapUrl}
        clock={formatClock(data.now, timeZone)}
        onInfo={onInfo}
        onPickStation={onPickStation}
        onSearchStation={onSearchStation}
        onDragStart={startDrag}
        up={up}
        down={down}
        titleRef={titleRef}
        contextRef={contextRef}
      />

      <CompactBar
        name={stationName}
        stationCode={home.stationCode}
        lines={lines}
        up={up}
        onTrip={() => navigate("/trip?pick=to")}
        onSearchStation={onSearchStation}
        onInfo={onInfo}
        barRef={barRef}
      />

      <motion.main
        className={styles.sheet}
        style={{
          y,
          boxShadow: sheetShadow,
          height: detents ? `calc(100dvh - ${detents.expanded}px)` : undefined,
          visibility: detents ? "visible" : "hidden",
        }}
        drag="y"
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={detents ? { top: detents.expanded, bottom: detents.peek } : undefined}
        dragElastic={0.12}
        dragMomentum={false}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={onDragEnd}
      >
        <div className={styles.handle} onPointerDown={startDrag}>
          <button
            type="button"
            className={styles.grabber}
            aria-label="调整面板高度"
            onPointerDown={(event) => {
              dragged.current = false;
              dragControls.start(event);
            }}
            onClick={() => {
              if (dragged.current) return;
              goTo(detent === "expanded" ? "normal" : "expanded");
            }}
            onKeyDown={onGrabberKey}
          />
        </div>

        <div
          ref={scrollRef}
          className={`${styles.scroll} ${detent === "expanded" ? styles.scrollable : ""}`}
        >
          {view === "station" && (
            <button
              type="button"
              className={styles.tripEntry}
              onClick={() => navigate("/trip?pick=to")}
            >
              <SearchIcon aria-hidden />从{stationName}去哪里？
            </button>
          )}
          {/* 吸顶：滚动时分段控制（以及线路视图的方向标题）始终可见，随时能切回「车站」。 */}
          <div className={styles.controls}>
            <Segmented
              label="看板视图"
              options={viewOptions}
              value={view}
              onChange={(next) => {
                onViewChange(next);
                // 面板停在用户放的位置，不跟着切换自己推上去（想看整条线再往上拖）。
                // 线路视图打开时自己把本站滚到中间；切回车站时从列表开头看起。
                if (next === "station") scrollRef.current?.scrollTo({ top: 0 });
              }}
            />
            {view === "line" && (
              <LineSwitcher
                lines={data.orderedLines}
                value={primaryLine?.lineCode}
                onChange={onChooseLine}
              />
            )}
            {view === "line" && lineLayout && (
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

          {/*
            切换「车站 / 线路」时内容顺着分段控制的方向滑入并淡入：切到右边的「线路」从右边来，
            切回「车站」从左边来。只做进场，旧内容直接换掉，不让两份内容叠在一起。
          */}
          <motion.div
            key={view}
            initial={reduceMotion ? false : { opacity: 0, x: view === "line" ? 24 : -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
          >
            {view === "line" ? (
              <LinePanel data={data} onSelectTrain={onSelectTrain} />
            ) : (
              <>
                <StatusNotice stationLineCodes={data.lines.map((l) => l.lineCode)} />
                <DepartureList data={data} limit={rowsShown} />
              </>
            )}
          </motion.div>
        </div>
      </motion.main>
    </div>
  );
}
