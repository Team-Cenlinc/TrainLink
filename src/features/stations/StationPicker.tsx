import { useMemo, useState } from "react";
import CloseIcon from "@material-symbols/svg-400/outlined/close.svg?react";
import CollapseIcon from "@material-symbols/svg-400/outlined/keyboard_arrow_down.svg?react";
import SearchIcon from "@material-symbols/svg-400/outlined/search.svg?react";
import StarIcon from "@material-symbols/svg-400/outlined/star.svg?react";
import StarFillIcon from "@material-symbols/svg-400/outlined/star-fill.svg?react";
import { Overlay } from "@/components/Overlay.tsx";
import { ServiceBadge } from "@/components/ServiceBadge.tsx";
import { lineKey } from "@/lib/gtfs.ts";
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
import { servingLines } from "@/lib/station.ts";
import styles from "./StationPicker.module.css";

interface StationPickerProps {
  open: boolean;
  onClose: () => void;
  variant: "sheet" | "popover";
  anchor?: DOMRect;
}

/** 选择器里的一个车站。 */
interface Entry {
  key: string;
  ref: HomeStation;
  name: string;
  secondaryName?: string;
  lines: RailStationLine[];
}

/**
 * 车站选择：搜索、常用车站、按线路分组的全部车站。
 * 点一个车站就把它设为本站并关闭；星标加入或移出常用车站。
 */
export function StationPicker({ open, onClose, variant, anchor }: StationPickerProps) {
  return (
    <Overlay
      open={open}
      onClose={onClose}
      variant={variant}
      anchor={anchor}
      labelledBy="station-picker-title"
    >
      <PickerContent onClose={onClose} variant={variant} />
    </Overlay>
  );
}

function PickerContent({ onClose, variant }: Pick<StationPickerProps, "onClose" | "variant">) {
  const home = useHomeStation();
  const favorites = useFavoriteStations();
  const catalog = useCatalog();
  const gtfs = useGtfs(home.serverId);
  const [query, setQuery] = useState("");

  // 车站条目与按线路的分组只在数据变化时重算。
  const { entries, groups } = useMemo(() => {
    const data = catalog.data;
    if (!data) return { entries: [] as Entry[], groups: [] };
    const operatorCode = new Map(data.operators.map((o) => [o.id, o.code]));
    const entries: Entry[] = data.stations.map((s) => ({
      key: s.id,
      ref: {
        serverId: s.serverId,
        operatorCode: operatorCode.get(s.operatorId) ?? "",
        stationCode: s.code,
      },
      name: s.name,
      secondaryName: s.secondaryName,
      lines: servingLines(s),
    }));
    const byCode = (op: string, code: string) =>
      entries.find((e) => e.ref.operatorCode === op && e.ref.stationCode === code);

    // 每条线路按 GTFS 站序列出车站；没有站序时按 catalog 中停靠该线的车站排列。
    const groups = data.lines.map((line) => {
      const op = operatorCode.get(line.operatorId) ?? "";
      const order = gtfs.data?.lineOrders.get(lineKey(op, line.code));
      const stations = order
        ? order.map((code) => byCode(op, code)).filter((e): e is Entry => Boolean(e))
        : entries.filter((e) => e.lines.some((l) => l.lineId === line.id));
      return { line, stations };
    });
    return { entries, groups: groups.filter((g) => g.stations.length > 0) };
  }, [catalog.data, gtfs.data]);

  const isFavorite = (e: Entry) => favorites.some((f) => sameStation(f, e.ref));
  const choose = (e: Entry) => {
    setHomeStation(e.ref);
    onClose();
  };

  const q = query.trim().toLowerCase();
  const results = q
    ? entries.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.ref.stationCode.toLowerCase().includes(q) ||
          e.secondaryName?.toLowerCase().includes(q),
      )
    : [];
  const favoriteEntries = favorites
    .map((f) => entries.find((e) => sameStation(e.ref, f)))
    .filter((e): e is Entry => Boolean(e));

  const row = (e: Entry) => (
    <StationRow
      key={e.key}
      entry={e}
      current={sameStation(e.ref, home)}
      favorite={isFavorite(e)}
      onChoose={() => choose(e)}
      onToggleFavorite={() => toggleFavorite(e.ref)}
    />
  );

  return (
    <>
      <header className={styles.header}>
        <h2 id="station-picker-title" className={styles.title}>
          选择车站
        </h2>
        <button
          type="button"
          className={styles.close}
          aria-label={variant === "popover" ? "关闭" : "收起"}
          onClick={onClose}
          data-autofocus={variant === "sheet" ? true : undefined}
        >
          {variant === "popover" ? <CloseIcon aria-hidden /> : <CollapseIcon aria-hidden />}
        </button>
      </header>

      <label className={styles.search}>
        <SearchIcon aria-hidden />
        <input
          type="search"
          placeholder="站名、站码或英文名"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          // 大屏直接聚焦搜索框；手机上不自动弹出键盘。
          data-autofocus={variant === "popover" ? true : undefined}
          aria-label="搜索车站"
        />
      </label>

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
  current,
  favorite,
  onChoose,
  onToggleFavorite,
}: {
  entry: Entry;
  current: boolean;
  favorite: boolean;
  onChoose: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <li className={styles.row}>
      <button
        type="button"
        className={styles.choose}
        onClick={onChoose}
        aria-current={current || undefined}
      >
        <span className={styles.name}>{entry.name}</span>
        <span className={styles.meta}>
          <span className={styles.code}>{entry.ref.stationCode}</span>
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
