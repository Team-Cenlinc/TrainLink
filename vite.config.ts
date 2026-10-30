import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
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

export default defineConfig({
  plugins: [react(), svgr()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { proxy: railApiProxy },
  preview: { proxy: railApiProxy },
});
