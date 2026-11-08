import { useMemo, useState } from "react";
import CloseIcon from "@material-symbols/svg-400/outlined/close.svg?react";
import CollapseIcon from "@material-symbols/svg-400/outlined/keyboard_arrow_down.svg?react";
import SearchIcon from "@material-symbols/svg-400/outlined/search.svg?react";
import StarIcon from "@material-symbols/svg-400/outlined/star.svg?react";
import StarFillIcon from "@material-symbols/svg-400/outlined/star-fill.svg?react";
import { Overlay } from "@/components/Overlay.tsx";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import { lineKey } from "@/lib/gtfs.ts";
import { operatorLabel } from "@/features/trip/stations.ts";
import { hubLines, hubOf } from "@/lib/hubs.ts";
import { allStations, lineShape } from "@/lib/lineShape.ts";
import {
  sameStation,
  setHomeStation,
  toggleFavorite,
  useFavoriteStations,
  useHomeStation,
  type HomeStation,
} from "@/lib/homeStation.ts";
import { useCatalog, useGtfs } from "@/lib/queries.ts";
import type { RailStationLine } from "@/lib/railApi.ts";
import { useSettings, useShownOperators } from "@/lib/settings.ts";
import styles from "./StationPicker.module.css";

interface StationPickerProps {
  open: boolean;
  onClose: () => void;
  variant: "sheet" | "popover";
  anchor?: DOMRect;
  /** 标题，默认「选择车站」。 */
  title?: string;
  /** 选中一个车站时调用；省略时把它设为本站（看板的用法）。 */
  onChoose?: (station: HomeStation) => void;
  /**
   * 打开时把光标放进搜索框（手机上会弹出键盘）。行程里找目的地时用：打开就是为了搜索。
   * 默认只有大屏这样做；手机上换本站多半是点常用车站，不弹键盘。
   */
  focusSearch?: boolean;
}

/**
 * 选择器里的一个车站。枢纽（两家运营方的车站合成一个站，见 lib/hubs.ts）只列一项：
 * ref 是选中时存下的成员站，members 是枢纽里（显示的运营方的）全部成员站。
 */
interface Entry {
  key: string;
  ref: HomeStation;
  members: HomeStation[];
  name: string;
  /** 搜索用：各成员站的站名、英文名与站码。 */
  searchText: string;
  /** 运营方名（不是枢纽时）：两个车站同名时写在后面区分。 */
  operatorName?: string;
  lines: RailStationLine[];
}

/**
 * 车站选择：搜索、常用车站、按线路分组的全部车站。
 * 点一个车站就选中并关闭：看板上是把它设为本站，行程里是选起点或终点（onChoose）；
 * 星标加入或移出常用车站。
 */
export function StationPicker({
  open,
  onClose,
  variant,
  anchor,
  title = "选择车站",
  onChoose = setHomeStation,
  focusSearch = variant === "popover",
}: StationPickerProps) {
  return (
    <Overlay
      open={open}
      onClose={onClose}
      variant={variant}
      anchor={anchor}
      labelledBy="station-picker-title"
      fill
    >
      <PickerContent
        onClose={onClose}
        variant={variant}
        title={title}
        onChoose={onChoose}
        focusSearch={focusSearch}
      />
    </Overlay>
  );
}

function PickerContent({
  onClose,
  variant,
  title,
  onChoose,
  focusSearch,
}: Pick<StationPickerProps, "onClose" | "variant"> & {
  title: string;
  onChoose: (station: HomeStation) => void;
  focusSearch: boolean;
}) {
  const home = useHomeStation();
  const favorites = useFavoriteStations();
  const catalog = useCatalog();
  const gtfs = useGtfs(home.serverId);
  const shown = useShownOperators();
  const [query, setQuery] = useState("");

  // 车站条目与按线路的分组只在数据变化时重算。
  const { entries, groups } = useMemo(() => {
    const data = catalog.data;
    if (!data) return { entries: [] as Entry[], groups: [] };
    const operatorCode = new Map(data.operators.map((o) => [o.id, o.code]));
    const operatorName = new Map(data.operators.map((o) => [o.id, operatorLabel(o)]));
    // 只列本站所在服务器、设置里显示的运营方的车站与线路。
    const listed = (item: { serverId: string; operatorId: string }) =>
      item.serverId === home.serverId && shown.byId(item.operatorId);
    const refOf = (s: { serverId: string; operatorId: string; code: string }): HomeStation => ({
      serverId: s.serverId,
      operatorCode: operatorCode.get(s.operatorId) ?? "",
      stationCode: s.code,
    });
    // 枢纽只列一项，排在第一个成员站的位置。
    const entries: Entry[] = [];
    const seen = new Set<string>();
    for (const station of data.stations.filter(listed)) {
      if (seen.has(station.id)) continue;
      const hub = hubOf(data, station);
      const members = hub.members.filter(listed);
      for (const m of members) seen.add(m.id);
      const refs = members.map(refOf);
      entries.push({
        key: station.id,
        // 本站就在这个枢纽里时，选它不换成员站（站牌停在原来那一家）。
        ref: refs.find((r) => sameStation(r, home)) ?? refs[0]!,
        members: refs,
        name: members.length > 1 ? hub.name : station.name,
        ...(members.length === 1 && { operatorName: operatorName.get(station.operatorId) }),
        searchText: members
          .flatMap((m) => [m.name, m.secondaryName ?? "", m.code])
          .join("\n")
          .toLowerCase(),
        lines: hubLines(members),
      });
    }
    const byCode = (op: string, code: string) =>
      entries.find((e) => e.members.some((m) => m.operatorCode === op && m.stationCode === code));

    // 每条线路按 GTFS 站序列出车站（有支线时主干在前、支线在后）；没有站序时按 catalog 中停靠该线的车站排列。
    const groups = data.lines.filter(listed).map((line) => {
      const op = operatorCode.get(line.operatorId) ?? "";
      const patterns = gtfs.data?.linePatterns.get(lineKey(op, line.code));
      const order = patterns && allStations(lineShape(patterns));
      const stations = order
        ? order.map((code) => byCode(op, code)).filter((e): e is Entry => Boolean(e))
        : entries.filter((e) => e.lines.some((l) => l.lineId === line.id));
      return { line, stations };
    });
    return { entries, groups: groups.filter((g) => g.stations.length > 0) };
  }, [catalog.data, gtfs.data, home.serverId, shown]);

  const inEntry = (e: Entry, station: HomeStation) =>
    e.members.some((m) => sameStation(m, station));
  const isFavorite = (e: Entry) => favorites.some((f) => inEntry(e, f));
  // 枢纽：收藏过的成员站（可能不止一个）全部移出；没收藏时收藏选中会存下的那个成员站。
  const toggleEntryFavorite = (e: Entry) => {
    const saved = favorites.filter((f) => inEntry(e, f));
    for (const f of saved.length ? saved : [e.ref]) toggleFavorite(f);
  };
  const choose = (e: Entry) => {
    onChoose(e.ref);
    onClose();
  };

  // 还没有线路的车站（例如刚建好的站）坐不了车，不列出来；本站与常用车站照常列。
  const usable = entries.filter((e) => e.lines.length > 0 || inEntry(e, home) || isFavorite(e));
  // 同名的车站（不同运营方、不在同一个枢纽）写上运营方区分。
  const nameCount = new Map<string, number>();
  for (const e of usable) nameCount.set(e.name, (nameCount.get(e.name) ?? 0) + 1);
  const q = query.trim().toLowerCase();
  const results = q
    ? usable.filter((e) => e.name.toLowerCase().includes(q) || e.searchText.includes(q))
    : [];
  const favoriteEntries = [
    ...new Set(
      favorites
        .map((f) => entries.find((e) => inEntry(e, f)))
        .filter((e): e is Entry => Boolean(e)),
    ),
  ];

  const row = (e: Entry) => (
    <StationRow
      key={e.key}
      entry={e}
      showOperator={(nameCount.get(e.name) ?? 0) > 1}
      current={inEntry(e, home)}
      favorite={isFavorite(e)}
      onChoose={() => choose(e)}
      onToggleFavorite={() => toggleEntryFavorite(e)}
    />
  );

  return (
    <>
      {/* 标题与搜索框吸顶：往下翻车站列表、搜索结果变少时，搜索框都停在原处。 */}
      <div className={styles.top}>
        <header className={styles.header}>
          <h2 id="station-picker-title" className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.close}
            aria-label={variant === "popover" ? "关闭" : "收起"}
            onClick={onClose}
            data-autofocus={focusSearch ? undefined : true}
          >
            {variant === "popover" ? <CloseIcon aria-hidden /> : <CollapseIcon aria-hidden />}
          </button>
        </header>

        <label className={styles.search}>
          <SearchIcon aria-hidden />
          <input
            type="search"
            placeholder="站名或英文名"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            data-autofocus={focusSearch ? true : undefined}
            aria-label="搜索车站"
          />
        </label>
      </div>

      {catalog.isPending ? (
        <p className={styles.message}>正在读取车站…</p>
      ) : q ? (
        results.length ? (
          <ul className={styles.list}>{results.map(row)}</ul>
        ) : (
          <p className={styles.message}>没有找到「{query.trim()}」。</p>
        )
      ) : (
        <>
          {favoriteEntries.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>常用车站</h3>
              <ul className={styles.list}>{favoriteEntries.map(row)}</ul>
            </section>
          )}
          {groups.map(({ line, stations }) => (
            <section key={line.id} className={styles.section}>
              <h3 className={styles.sectionTitle}>
                <ServiceBadge lineCode={line.code} lineColor={line.color} size="s" />
                {line.name}
              </h3>
              <ul className={styles.list}>{stations.map(row)}</ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}

function StationRow({
  entry,
  showOperator,
  current,
  favorite,
  onChoose,
  onToggleFavorite,
}: {
  entry: Entry;
  /** 有同名车站时写上运营方。 */
  showOperator: boolean;
  current: boolean;
  favorite: boolean;
  onChoose: () => void;
  onToggleFavorite: () => void;
}) {
  const { showStationCodes } = useSettings();
  return (
    <li className={styles.row}>
      <button
        type="button"
        className={styles.choose}
        onClick={onChoose}
        aria-current={current || undefined}
      >
        <span className={styles.name}>
          {entry.name}
          {showOperator && entry.operatorName && (
            <span className={styles.operator}>{entry.operatorName}</span>
          )}
        </span>
        <span className={styles.meta}>
          {showStationCodes && <span className={styles.code}>{entry.ref.stationCode}</span>}
          {entry.lines.map((l) => (
            <ServiceBadge key={l.lineId} lineCode={l.lineCode} lineColor={l.color} size="s" />
          ))}
          {current && <span className={styles.here}>本站</span>}
        </span>
      </button>
      <button
        type="button"
        className={`${styles.star} ${favorite ? styles.starred : ""}`}
        aria-pressed={favorite}
        aria-label={favorite ? `把${entry.name}移出常用车站` : `把${entry.name}加入常用车站`}
        onClick={onToggleFavorite}
      >
        {favorite ? <StarFillIcon aria-hidden /> : <StarIcon aria-hidden />}
      </button>
    </li>
  );
}
