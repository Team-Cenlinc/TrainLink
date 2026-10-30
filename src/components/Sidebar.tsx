import { useState } from "react";
import { NavLink } from "react-router";
import { readHomeStation } from "@/lib/homeStation.ts";
import { useCatalog } from "@/lib/queries.ts";
import { findStation, servingLines } from "@/lib/station.ts";
import { navItems } from "./navItems.ts";
import { ServiceBadge } from "./ServiceBadge.tsx";
import styles from "./Sidebar.module.css";

/**
 * 桌面侧边栏（宽度 ≥ 1280）：品牌、五个一级入口、常用车站。
 * 取代手机与平板的浮动标签栏，选中项用圆角 14 的浅底。
 */
export function Sidebar() {
  const [home] = useState(readHomeStation);
  const catalog = useCatalog();
  const station = findStation(catalog.data, home.serverId, home.operatorCode, home.stationCode);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        {/* App 图标（H 风车），由 scripts/build-icons.ts 生成。 */}
        <img className={styles.mark} src="/icons/icon.svg" alt="" width={32} height={32} />
        TrainLink
      </div>

      <nav className={styles.nav} aria-label="主导航">
        {navItems.map(({ to, label, icon: Icon, activeIcon: ActiveIcon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ""}`}
          >
            {({ isActive }) => (
              <>
                {isActive ? <ActiveIcon aria-hidden /> : <Icon aria-hidden />}
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>常用车站</h2>
        <NavLink to="/" className={styles.station}>
          <span>{station?.name ?? home.stationCode}</span>
          <span className={styles.badges}>
            {station &&
              servingLines(station).map((line) => (
                <ServiceBadge
                  key={line.lineId}
                  lineCode={line.lineCode}
                  lineColor={line.color}
                  size="s"
                />
              ))}
          </span>
        </NavLink>
      </section>
    </aside>
  );
}
