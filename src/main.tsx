import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { App } from "./App.tsx";
import { BoardPage } from "./features/board/BoardPage.tsx";
import { PlaceholderPage } from "./features/placeholder/PlaceholderPage.tsx";
import { StatusPage } from "./features/status/StatusPage.tsx";
import { persistOptions, queryClient } from "./lib/queryClient.ts";
import "./styles/global.css";

/** 五个标签各对应一个路由，共用 App 外壳。 */
const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <BoardPage /> },
      { path: "trip", element: <PlaceholderPage title="行程" /> },
      { path: "status", element: <StatusPage /> },
      { path: "tickets", element: <PlaceholderPage title="车票" /> },
      { path: "settings", element: <PlaceholderPage title="设置" /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* 数据缓存同时存到本地，刷新页面后先显示上次的数据（见 lib/queryClient.ts）。 */}
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <RouterProvider router={router} />
    </PersistQueryClientProvider>
  </StrictMode>,
);
