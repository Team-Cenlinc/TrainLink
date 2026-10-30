import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useNavigate } from "react-router";
import { motion, useTransform } from "motion/react";
import ScheduleIcon from "@material-symbols/svg-400/outlined/schedule.svg?react";
import SearchIcon from "@material-symbols/svg-400/outlined/search.svg?react";
import { Segmented } from "@/components/Segmented.tsx";
import { readHomeStation } from "@/lib/homeStation.ts";
import { useBoard, useCatalog, useLineOrders, useNow } from "@/lib/queries.ts";
import { sourceTimeZone } from "@/lib/railApi.ts";
import {
  blueMapUrl,
  findStation,
  nearestTransfer,
  neighbourStops,
  servingLines,
  transferLines,
} from "@/lib/station.ts";
import { formatClock } from "@/lib/time.ts";
import { CompactBar } from "./CompactBar.tsx";
import { DepartureGroup } from "./DepartureGroup.tsx";
import { groupByPlatform } from "./departures.ts";
import { StationHeader } from "./StationHeader.tsx";
import { StationInfoSheet } from "./StationInfoSheet.tsx";
import { useSheetDetents, type Detent, type Detents } from "./useSheetDetents.ts";
import styles from "./BoardPage.module.css";

type BoardView = "station" | "line";

const viewOptions = [
  { value: "station", label: "车站" },
  { value: "line", label: "线路" },
] as const;

/** 各档显示的班次数：下拉只看下一班，默认 4 班，推上显示 1 小时内全部。 */
const rowsByDetent: Record<Detent, number | undefined> = {
  peek: 1,
  normal: 4,
  expanded: undefined,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * 看板：打开 App 首先看到的本站页。
 * 线路色块铺在后面，发车面板叠在上面，可以拖到三个位置：
 * 下拉露出车站周围信息，默认看大站名与最近几班，推上看 1 小时内的全部班次。
 */
export function BoardPage() {
  // useState 的初始化函数只在第一次渲染时执行，避免每次渲染都读 localStorage。
  const [home] = useState(readHomeStation);
  const [view, setView] = useState<BoardView>("station");
  const [infoOpen, setInfoOpen] = useState(false);
  // 关闭函数保持同一个引用：车站信息面板的 effect 依赖它，否则每次刷新站牌都会重置焦点。
  const closeInfo = useCallback(() => setInfoOpen(false), []);
  const navigate = useNavigate();
  const now = useNow();
  const catalog = useCatalog();
  const board = useBoard(home);
  const lineOrders = useLineOrders(home.serverId);

  const station = findStation(catalog.data, home.serverId, home.operatorCode, home.stationCode);
  const lines = station ? servingLines(station) : [];
  const primaryLine = lines[0];
  const strip =
    station && primaryLine
      ? neighbourStops(catalog.data, lineOrders.data, station, primaryLine)
      : [];
  const transfers = station ? transferLines(station) : [];
  const nearest =
    station && primaryLine && transfers.length === 0
      ? nearestTransfer(catalog.data, lineOrders.data, station, primaryLine)
      : undefined;
  const mapUrl = station ? blueMapUrl(station) : undefined;
  const timeZone = sourceTimeZone(board.data, home.serverId);
  const groups = board.data
    ? groupByPlatform(board.data.departures, {
        serverId: home.serverId,
        now,
        timeZone,
        catalog: catalog.data,
      })
    : [];

  // ---------- 面板三档：量出各档位置 ----------
  const titleRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [detents, setDetents] = useState<Detents | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const expanded = barRef.current?.offsetHeight ?? 64;
      const titleBottom = titleRef.current?.getBoundingClientRect().bottom ?? 200;
      const contextBottom = contextRef.current?.getBoundingClientRect().bottom ?? titleBottom;
      const normal = Math.round(titleBottom + 24);
      // 下拉档至少比默认低 120，并给面板留出约 240 的可见高度。
      const peek = Math.round(
        Math.min(Math.max(contextBottom, normal + 120), window.innerHeight - 240),
      );
      setDetents({ expanded, normal, peek });
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

  // 标题栏与下拉内容的显隐跟着面板位置连续变化。转换函数读 ref，始终拿到最新的档位。
  const detentsRef = useRef(detents);
  detentsRef.current = detents;
  const barOpacity = useTransform(y, (v) => {
    const d = detentsRef.current;
    return d ? clamp01((d.normal - v) / ((d.normal - d.expanded) * 0.6)) : 0;
  });
  const barPointerEvents = useTransform<number, string>(y, (v) => {
    const d = detentsRef.current;
    return d && v < d.expanded + 24 ? "auto" : "none";
  });
  const contextOpacity = useTransform(y, (v) => {
    const d = detentsRef.current;
    return d ? clamp01((v - d.normal) / (d.peek - d.normal)) : 0;
  });

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

  const showControls = detent !== "peek";

  return (
    <div className={styles.page}>
      <StationHeader
        station={station}
        stationCode={home.stationCode}
        lines={lines}
        strip={strip}
        mapUrl={mapUrl}
        onInfo={() => setInfoOpen(true)}
        onDragStart={startDrag}
        contextOpacity={contextOpacity}
        titleRef={titleRef}
        contextRef={contextRef}
      />

      <CompactBar
        name={station?.name ?? home.stationCode}
        stationCode={home.stationCode}
        lines={lines}
        opacity={barOpacity}
        pointerEvents={barPointerEvents}
        onSearch={() => navigate("/trip")}
        onInfo={() => setInfoOpen(true)}
        barRef={barRef}
      />

      <motion.main
        className={styles.sheet}
        style={{
          y,
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

        <div className={`${styles.scroll} ${detent === "expanded" ? styles.scrollable : ""}`}>
          {showControls && (
            <>
              <button type="button" className={styles.tripEntry} onClick={() => navigate("/trip")}>
                <SearchIcon aria-hidden />从{station?.name ?? "本站"}去哪里？
              </button>
              <div className={styles.controls}>
                <Segmented label="看板视图" options={viewOptions} value={view} onChange={setView} />
                <span className={styles.now}>
                  <ScheduleIcon aria-hidden />
                  <span className="num">{formatClock(now, timeZone)}</span>
                </span>
              </div>
            </>
          )}

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
            groups.map((group) => (
              <DepartureGroup key={group.platform} group={group} limit={rowsByDetent[detent]} />
            ))
          )}

          {board.data?.state === "partial" && (
            <p className={styles.note}>部分服务器暂时不可用，列表可能不完整。</p>
          )}
        </div>
      </motion.main>

      <StationInfoSheet
        open={infoOpen}
        onClose={closeInfo}
        station={station}
        stationCode={home.stationCode}
        lines={lines}
        platforms={groups.map((g) => ({ platform: g.platform, destinations: g.destinations }))}
        transfers={transfers}
        nearest={nearest}
        mapUrl={mapUrl}
      />
    </div>
  );
}
