import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import svgr from "vite-plugin-svgr";

/** Fetarute 铁路 API 的公开地址；生产环境由浏览器直接请求。 */
const railApiOrigin = "https://site-api.fetarute.info";

/**
 * 铁路 API 的 CORS 只允许官网与 trainlink.fetarute.info，不含 localhost。
 * 本地开发和本地预览经 Vite 代理转发，浏览器只看到同源的 /v1/rail 请求，因此不受 CORS 限制。
 */
const railApiProxy = {
  "/v1/rail": { target: railApiOrigin, changeOrigin: true },
};

/** App 版本号（package.json），设置页「关于」里显示。 */
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as {
  version: string;
};

/**
 * 已知路由（与 src/main.tsx 的路由一致）。GitHub Pages 不能把任意路径改写到 index.html，
 * 所以构建时给这些路由各复制一份 index.html：直接打开、刷新或被分享卡片抓取时都返回 200。
 * 带参数的路径（/tickets/某张票）由 404.html 接住，同样加载 App，再由前端路由显示对应页面。
 */
const spaRoutes = ["trip", "trip/results", "trip/guide", "status", "tickets", "settings"];

function spaFallback(): Plugin {
  return {
    name: "trainlink-spa-fallback",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const index = bundle["index.html"];
      if (index?.type !== "asset") return;
      for (const fileName of [...spaRoutes.map((route) => `${route}/index.html`), "404.html"]) {
        this.emitFile({ type: "asset", fileName, source: index.source });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), svgr(), spaFallback()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { proxy: railApiProxy },
  preview: { proxy: railApiProxy },
});
