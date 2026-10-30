import type { ComponentType, SVGProps } from "react";
import { NavLink } from "react-router";
import RouteIcon from "@material-symbols/svg-400/outlined/route.svg?react";
import RouteFillIcon from "@material-symbols/svg-400/outlined/route-fill.svg?react";
import SettingsIcon from "@material-symbols/svg-400/outlined/settings.svg?react";
import SettingsFillIcon from "@material-symbols/svg-400/outlined/settings-fill.svg?react";
import TicketIcon from "@material-symbols/svg-400/outlined/confirmation_number.svg?react";
import TicketFillIcon from "@material-symbols/svg-400/outlined/confirmation_number-fill.svg?react";
import TrainIcon from "@material-symbols/svg-400/outlined/train.svg?react";
import TrainFillIcon from "@material-symbols/svg-400/outlined/train-fill.svg?react";
import WarningIcon from "@material-symbols/svg-400/outlined/warning.svg?react";
import WarningFillIcon from "@material-symbols/svg-400/outlined/warning-fill.svg?react";
import styles from "./TabBar.module.css";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

interface Tab {
  to: string;
  label: string;
  icon: Icon;
  /** 选中时换成实心图标，与 iOS 标签栏一致。 */
  activeIcon: Icon;
}

const tabs: Tab[] = [
  { to: "/", label: "看板", icon: TrainIcon, activeIcon: TrainFillIcon },
  { to: "/trip", label: "行程", icon: RouteIcon, activeIcon: RouteFillIcon },
  { to: "/status", label: "运行状态", icon: WarningIcon, activeIcon: WarningFillIcon },
  { to: "/tickets", label: "车票", icon: TicketIcon, activeIcon: TicketFillIcon },
  { to: "/settings", label: "设置", icon: SettingsIcon, activeIcon: SettingsFillIcon },
];

/**
 * 浮动标签栏：底部居中的胶囊，内容从它下面滚过（iOS 26 风格）。
 * NavLink 会把当前路由对应的项标为 active，并通过 render 函数把 isActive 交给子元素。
 */
export function TabBar() {
  return (
    <nav className={styles.bar} aria-label="主导航">
      {tabs.map(({ to, label, icon: Icon, activeIcon: ActiveIcon }) => (
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
