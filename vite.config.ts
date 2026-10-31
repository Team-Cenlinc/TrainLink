import { readFileSync } from "node:fs";
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

/** App 版本号（package.json），设置页「关于」里显示。 */
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as {
  version: string;
};

export default defineConfig({
  plugins: [react(), svgr()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { proxy: railApiProxy },
  preview: { proxy: railApiProxy },
});
