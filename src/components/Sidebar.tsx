import { NavLink, useNavigate } from "react-router";
import {
  sameStation,
  setHomeStation,
  useFavoriteStations,
  useHomeStation,
} from "@/lib/homeStation.ts";
import { useCatalog } from "@/lib/queries.ts";
import { findStation, servingLines } from "@/lib/station.ts";
import { navItems } from "./navItems.ts";
import { ServiceBadge } from "./ServiceBadge.tsx";
import styles from "./Sidebar.module.css";

/**
 * 桌面侧边栏（宽度 ≥ 1280）：品牌、五个一级入口、常用车站。
 * 取代手机与平板的浮动标签栏，选中项用圆角 14 的浅底。
 * 常用车站点一下就切换本站并回到看板。
 */
export function Sidebar() {
  const home = useHomeStation();
  const favorites = useFavoriteStations();
  const catalog = useCatalog();
  const navigate = useNavigate();

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
        {/* 只列当前服务器上的常用车站。 */}
        {favorites
          .filter((f) => f.serverId === home.serverId)
          .map((favorite) => {
            const station = findStation(
              catalog.data,
              favorite.serverId,
              favorite.operatorCode,
              favorite.stationCode,
            );
            const current = sameStation(favorite, home);
            return (
              <button
                key={`${favorite.operatorCode}:${favorite.stationCode}`}
                type="button"
                className={`${styles.station} ${current ? styles.currentStation : ""}`}
                aria-current={current || undefined}
                onClick={() => {
                  setHomeStation(favorite);
                  navigate("/");
                }}
              >
                <span>{station?.name ?? favorite.stationCode}</span>
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
              </button>
            );
          })}
      </section>
    </aside>
  );
}
