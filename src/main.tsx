import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { App } from "./App.tsx";
import { BoardPage } from "./features/board/BoardPage.tsx";
import { PlaceholderPage } from "./features/placeholder/PlaceholderPage.tsx";
import { StatusPage } from "./features/status/StatusPage.tsx";
import { TicketPage } from "./features/tickets/TicketPage.tsx";
import { TicketsPage } from "./features/tickets/TicketsPage.tsx";
import { GuidePage } from "./features/trip/GuidePage.tsx";
import { ResultsPage } from "./features/trip/ResultsPage.tsx";
import { TripPage } from "./features/trip/TripPage.tsx";
import { centerFontMetrics } from "./lib/fontMetrics.ts";
import { persistOptions, queryClient } from "./lib/queryClient.ts";
import "./styles/global.css";

/** 五个标签各对应一个路由，共用 App 外壳。 */
const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <BoardPage /> },
      { path: "trip", element: <TripPage /> },
      { path: "trip/results", element: <ResultsPage /> },
      { path: "trip/guide", element: <GuidePage /> },
      { path: "status", element: <StatusPage /> },
      { path: "tickets", element: <TicketsPage /> },
      { path: "tickets/:id", element: <TicketPage /> },
      { path: "settings", element: <PlaceholderPage title="设置" /> },
    ],
  },
]);

// 文字在标签、按钮里上下居中（见 lib/fontMetrics.ts）；不等它，字体规则到了再生效。
void centerFontMetrics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* 数据缓存同时存到本地，刷新页面后先显示上次的数据（见 lib/queryClient.ts）。 */}
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <RouterProvider router={router} />
    </PersistQueryClientProvider>
  </StrictMode>,
);
