/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 覆盖铁路 API 地址；设为空字符串时走同源路径（配合 Vite 代理在本地预览生产构建）。 */
  readonly VITE_RAIL_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
