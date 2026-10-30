import { NavLink } from "react-router";
import { navItems } from "./navItems.ts";
import styles from "./TabBar.module.css";

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
