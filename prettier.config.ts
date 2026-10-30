import type { Config } from "prettier";

/**
 * 项目统一格式化配置，与 Fetarute-Website 保持一致。
 * TypeScript 配置文件依赖 Node 24 type stripping，脚本里通过 NODE_OPTIONS 显式启用。
 */
const config: Config = {
  printWidth: 100,
  proseWrap: "always",
  semi: true,
  singleQuote: false,
  trailingComma: "all",
};

export default config;
