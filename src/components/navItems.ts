import type { ComponentType, SVGProps } from "react";
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

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface NavItem {
  to: string;
  label: string;
  icon: Icon;
  /** 选中时换成实心图标，与 iOS 标签栏一致。 */
  activeIcon: Icon;
}

/** 五个一级入口；手机与平板的浮动标签栏、桌面的侧边栏共用。 */
export const navItems: NavItem[] = [
  { to: "/", label: "看板", icon: TrainIcon, activeIcon: TrainFillIcon },
  { to: "/trip", label: "行程", icon: RouteIcon, activeIcon: RouteFillIcon },
  { to: "/status", label: "运行状态", icon: WarningIcon, activeIcon: WarningFillIcon },
  { to: "/tickets", label: "车票", icon: TicketIcon, activeIcon: TicketFillIcon },
  { to: "/settings", label: "设置", icon: SettingsIcon, activeIcon: SettingsFillIcon },
];
