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
import SearchIcon from "@material-symbols/svg-400/outlined/search.svg?react";
import { Segmented } from "@/components/Segmented.tsx";
import { readHomeStation } from "@/lib/homeStation.ts";
import { useBoard, useCatalog, useGtfs, useNow, useTrains } from "@/lib/queries.ts";
import { sourceTimeZone } from "@/lib/railApi.ts";
import { lineKey } from "@/lib/gtfs.ts";
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
import { buildLineLayout } from "./linePositions.ts";
import { LineDirections, LineView } from "./LineView.tsx";
import { groupByPlatform } from "./departures.ts";
import { StationHeader } from "./StationHeader.tsx";
import { StationInfoSheet } from "./StationInfoSheet.tsx";
import { useSheetDetents, type Detents } from "./useSheetDetents.ts";
import styles from "./BoardPage.module.css";

type BoardView = "station" | "line";

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

/**
 * 看板：打开 App 首先看到的本站页。
 * 线路色块铺在后面，发车面板叠在上面，可以拖到三个位置：
 * 下拉露出车站周围信息；默认看大站名与最近几班；推上时大站名收进一行标题栏，面板占满屏幕。
 * 所有过渡都由面板位置直接驱动（跟手），不是按时间播放的动画。
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
  const gtfs = useGtfs(home.serverId);
  // 列车位置只在「线路」视图打开时读取。
  const trains = useTrains(view === "line");

  const station = findStation(catalog.data, home.serverId, home.operatorCode, home.stationCode);
  const lines = station ? servingLines(station) : [];
  const primaryLine = lines[0];
  const strip =
    station && primaryLine
      ? neighbourStops(catalog.data, gtfs.data?.lineOrders, station, primaryLine)
      : [];
  const transfers = station ? transferLines(station) : [];
  const nearest =
    station && primaryLine && transfers.length === 0
      ? nearestTransfer(catalog.data, gtfs.data?.lineOrders, station, primaryLine)
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

  const lineOrder = primaryLine
    ? gtfs.data?.lineOrders.get(lineKey(primaryLine.operatorCode, primaryLine.lineCode))
    : undefined;
  const lineLayout =
    view === "line" && primaryLine && lineOrder && trains.data
      ? buildLineLayout({
          order: lineOrder,
          line: primaryLine,
          serverId: home.serverId,
          stationCode: home.stationCode,
          trains: trains.data.trains,
          headsigns: gtfs.data?.headsigns ?? new Map(),
          departures: board.data?.departures ?? [],
          catalog: catalog.data,
        })
      : undefined;

  // ---------- 面板三档：量出各档位置 ----------
  const titleRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [detents, setDetents] = useState<Detents | null>(null);

  useLayoutEffect(() => {
    // 用 offsetTop/offsetHeight（布局位置）而不是 getBoundingClientRect：
    // 标题会随拖动缩放、位移，那是视觉变换，不能影响各档位置。
    const bottomOf = (el: HTMLElement | null) => (el ? el.offsetTop + el.offsetHeight : undefined);
    const measure = () => {
      const expanded = barRef.current?.offsetHeight ?? 64;
      const titleBottom = bottomOf(titleRef.current) ?? 200;
      const contextBottom = bottomOf(contextRef.current) ?? titleBottom;
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

  /*
   * 两个进度值把面板位置换算成 0–1，标题、标题栏、下拉内容都只读这两个值：
   * up：默认 → 推上（0 → 1）；down：默认 → 下拉（0 → 1）。
   * 转换函数读 ref，始终拿到最新量出的档位。
   */
  const detentsRef = useRef(detents);
  detentsRef.current = detents;
  const up = useTransform(y, (v) => {
    const d = detentsRef.current;
    return d ? clamp01((d.normal - v) / (d.normal - d.expanded)) : 0;
  });
  const down = useTransform(y, (v) => {
    const d = detentsRef.current;
    return d ? clamp01((v - d.normal) / (d.peek - d.normal)) : 0;
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
    <div className={styles.page}>
      <StationHeader
        station={station}
        stationCode={home.stationCode}
        lines={lines}
        strip={strip}
        mapUrl={mapUrl}
        clock={formatClock(now, timeZone)}
        onInfo={() => setInfoOpen(true)}
        onDragStart={startDrag}
        up={up}
        down={down}
        titleRef={titleRef}
        contextRef={contextRef}
      />

      <CompactBar
        name={station?.name ?? home.stationCode}
        stationCode={home.stationCode}
        lines={lines}
        up={up}
        onSearch={() => navigate("/trip")}
        onInfo={() => setInfoOpen(true)}
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

        <div className={`${styles.scroll} ${detent === "expanded" ? styles.scrollable : ""}`}>
          {view === "station" && (
            <button type="button" className={styles.tripEntry} onClick={() => navigate("/trip")}>
              <SearchIcon aria-hidden />从{station?.name ?? "本站"}去哪里？
            </button>
          )}
          {/* 吸顶：滚动时分段控制（以及线路视图的方向标题）始终可见，随时能切回「车站」。 */}
          <div className={styles.controls}>
            <Segmented
              label="看板视图"
              options={viewOptions}
              value={view}
              onChange={(next) => {
                setView(next);
                // 整条线需要更多空间，切到「线路」时把面板推上。
                if (next === "line") goTo("expanded");
              }}
            />
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

          {view === "line" ? (
            lineLayout ? (
              <LineView layout={lineLayout} lineColor={primaryLine?.color} />
            ) : trains.isError || gtfs.isError ? (
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
            ) : gtfs.data && !lineOrder ? (
              <p className={styles.message}>暂无这条线路的站序数据。</p>
            ) : (
              <p className={styles.message}>正在读取列车位置…</p>
            )
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
              <DepartureGroup key={group.platform} group={group} limit={rowsShown} />
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
