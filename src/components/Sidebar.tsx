import { NavLink, useNavigate } from "react-router";
import { setHomeStation, useFavoriteStations, useHomeStation } from "@/lib/homeStation.ts";
import { hubLines, hubOfRef, sameHub } from "@/lib/hubs.ts";
import { useCatalog } from "@/lib/queries.ts";
import { useShownOperators } from "@/lib/settings.ts";
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
  const shown = useShownOperators();
  const navigate = useNavigate();

  return (
    <aside className={styles.sidebar} data-sidebar>
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
            // 换页时淡入淡出（浏览器的视图过渡，见 global.css）。
            viewTransition
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
        {/* 只列当前服务器上的常用车站；同一个枢纽的成员站只列一次。 */}
        {favorites
          .filter((f) => f.serverId === home.serverId)
          .map((favorite) => ({ favorite, hub: hubOfRef(catalog.data, favorite) }))
          .filter(
            ({ hub }, i, all) =>
              !hub || all.findIndex((x) => x.hub?.members[0] === hub.members[0]) === i,
          )
          .map(({ favorite, hub }) => {
            const current = sameHub(catalog.data, favorite, home);
            return (
              <button
                key={`${favorite.operatorCode}:${favorite.stationCode}`}
                type="button"
                className={`${styles.station} ${current ? styles.currentStation : ""}`}
                aria-current={current || undefined}
                onClick={() => {
                  // 本站已在这个枢纽里时不换成员站（站牌停在原来那一家）。
                  if (!current) setHomeStation(favorite);
                  navigate("/");
                }}
              >
                <span>{hub?.name ?? favorite.stationCode}</span>
                <span className={styles.badges}>
                  {/* 枢纽：只列设置里显示的运营方的线路，同看板标题。 */}
                  {hubLines(hub?.members.filter((m) => shown.byId(m.operatorId)) ?? []).map(
                    (line) => (
                      <ServiceBadge
                        key={line.lineId}
                        lineCode={line.lineCode}
                        lineColor={line.color}
                        size="s"
                      />
                    ),
                  )}
                </span>
              </button>
            );
          })}
      </section>
    </aside>
  );
}
