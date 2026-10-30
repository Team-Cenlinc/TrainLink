import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { App } from "./App.tsx";
import { BoardPage } from "./features/board/BoardPage.tsx";
import { PlaceholderPage } from "./features/placeholder/PlaceholderPage.tsx";
import "./styles/global.css";

/** 五个标签各对应一个路由，共用 App 外壳。 */
const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <BoardPage /> },
      { path: "trip", element: <PlaceholderPage title="行程" /> },
      { path: "status", element: <PlaceholderPage title="运行状态" /> },
      { path: "tickets", element: <PlaceholderPage title="车票" /> },
      { path: "settings", element: <PlaceholderPage title="设置" /> },
    ],
  },
]);

/** 全局共享的数据缓存；失败时最多重试 2 次。 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
