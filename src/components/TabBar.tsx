import { NavLink } from "react-router";
import { navItems } from "./navItems.ts";
import styles from "./TabBar.module.css";

/**
 * 从 iOS 主屏打开（网页 App）。这时换页不做视图过渡：过渡期间页面换成整屏快照，
 * iOS 认不出贴顶的页面，会在状态栏下面闪一下边缘渐变；原生 App 的标签栏换页本来也不淡入淡出。
 */
const homeScreenApp =
  typeof navigator !== "undefined" &&
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/**
 * 浮动标签栏：底部居中的胶囊，内容从它下面滚过（iOS 26 风格）。
 * NavLink 会把当前路由对应的项标为 active，并通过 render 函数把 isActive 交给子元素。
 */
export function TabBar() {
  return (
    <nav className={styles.bar} aria-label="主导航">
      {navItems.map(({ to, label, icon: Icon, activeIcon: ActiveIcon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          // 换页时淡入淡出（浏览器的视图过渡，见 global.css）；主屏打开时不做，见上。
          viewTransition={!homeScreenApp}
          className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ""}`}
        >
          {({ isActive }) => (
            <>
              {isActive ? <ActiveIcon aria-hidden /> : <Icon aria-hidden />}
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
