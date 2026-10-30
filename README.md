# TrainLink

Fetarute 铁路的乘客 Web App：本站发车、列车位置、行程规划、乘车指南与纪念车票。计划部署在
`trainlink.fetarute.info`，以 PWA 安装使用，之后可用 Capacitor 封装。

## 技术栈

- Vite + React + TypeScript
- React Router：五个标签页（看板、行程、运行状态、车票、设置）各对应一个路由
- TanStack Query：读取并按 API 缓存时间轮询铁路数据
- CSS Modules：每个组件一份样式；颜色与圆角只用 `src/styles/tokens.css` 中的语义变量
- 图标：Material Symbols Outlined（`@material-symbols/svg-400`，经 vite-plugin-svgr 作为组件导入）

## 开发

需要 Node 24 与 npm 11。

```bash
npm install
npm run dev
```

铁路 API 的 CORS 只允许 Fetarute 官网与
`https://trainlink.fetarute.info`。生产环境由浏览器直接请求铁路 API；本地开发时 `/v1/rail`
请求经 Vite 代理转发到 `https://site-api.fetarute.info`，因此 localhost 不受 CORS 限制。

其他命令：

```bash
npm run typecheck   # 类型检查
npm run build       # 类型检查并构建到 dist/
npm run format      # Prettier 格式化
```

本地预览生产构建时，让 API 请求也走代理：

```bash
VITE_RAIL_API_BASE= npm run build && npm run preview
```

## 目录

```text
src/
  main.tsx              入口：路由与数据缓存
  App.tsx               外壳：当前页面 + 浮动标签栏
  components/           跨页面复用的组件（线路色牌、标签栏、侧边栏、分段控制）
  features/board/       看板：手机三档面板（CompactBoard）、平板与桌面多栏（WideBoard）、
                        按站台的发车列表、单线列车位置、车站信息
  features/placeholder/ 尚未实现的标签页
  lib/                  API 类型与读取、数据 Hook、本站、线路色工具
  styles/               设计 token 与全局样式
```

## 布局

按可用宽度切换（`src/lib/useLayout.ts`）：小于 600 为手机单栏加可拖动面板；600–1099 为两栏（本站发车 / 列车位置）；1100 以上为侧边栏加三栏（两个方向的发车与列车位置）。车站信息在手机上是底部面板，在大屏上是右上角的弹出卡片。

## 数据

接口说明见 Fetarute-Minecraft-API 的 `docs/api/rail-api.md`。当前使用：

- `GET /v1/rail/catalog`：线路、车站、换乘（线路色也来自这里）
- `GET /v1/rail/servers/{serverId}/stations/{operator}/{station}/board`：站牌
- `GET /v1/rail/servers/{serverId}/gtfs.zip`：GTFS 静态包，用来推出线路站序（catalog 没有站序）

种别（普通 / 快速）暂按交路 ID 推断，等 API 提供种别字段后改为直接读取。

车站在网页地图中的位置用 BlueMap 链接：`https://map.{serverId}.fetarute.org/#{世界}:{x}:{y}:{z}:…`。
