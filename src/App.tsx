import { Outlet } from "react-router";
import { Sidebar } from "@/components/Sidebar.tsx";
import { TabBar } from "@/components/TabBar.tsx";
import { RideBar } from "@/features/trip/RideBar.tsx";
import { useLayout } from "@/lib/useLayout.ts";
import styles from "./App.module.css";

/**
 * App 外壳：当前标签页的内容 + 导航。
 * 手机与平板用底部浮动标签栏；桌面（宽度 ≥ 1280）改用左侧边栏，内容区让出侧边栏的宽度。
 * 正在跟一趟乘车 GO 时，标签栏上方多一条「乘车中」迷你条（RideBar）。
 * Outlet 是 React Router 的占位符，路由匹配到哪一页就在这里渲染哪一页。
 */
export function App() {
  const layout = useLayout();
  if (layout === "wide") {
    return (
      <>
        <Sidebar />
        <div className={styles.withSidebar}>
          <Outlet />
        </div>
        <RideBar />
      </>
    );
  }
  return (
    <>
      <Outlet />
      <RideBar />
      <TabBar />
    </>
  );
}
