import { Outlet } from "react-router";
import { TabBar } from "@/components/TabBar.tsx";

/**
 * App 外壳：当前标签页的内容 + 浮动标签栏。
 * Outlet 是 React Router 的占位符，路由匹配到哪一页就在这里渲染哪一页。
 */
export function App() {
  return (
    <>
      <Outlet />
      <TabBar />
    </>
  );
}
