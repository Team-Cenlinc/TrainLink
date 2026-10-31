/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 覆盖铁路 API 地址；设为空字符串时走同源路径（配合 Vite 代理在本地预览生产构建）。 */
  readonly VITE_RAIL_API_BASE?: string;
}

/** App 版本号，构建时由 vite.config.ts 从 package.json 写入。 */
declare const __APP_VERSION__: string;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
