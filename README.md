# TrainLink

Fetarute 铁路的乘客 Web App：本站发车、列车位置、行程规划、乘车指南、运行状态与仿真车票。部署在
`https://trainlink.fetarute.info`（GitHub Pages），以 PWA 安装使用，之后可用 Capacitor 封装。

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
npm test            # 单元测试（Vitest，测试文件与源文件放在一起，*.test.ts）
npm run build       # 类型检查并构建到 dist/
npm run format      # Prettier 格式化
npm run icons       # 重新生成 App 图标、favicon.ico 与分享卡片图（定义在 scripts/build-icons.ts）
```

本地预览生产构建时，让 API 请求也走代理：

```bash
VITE_RAIL_API_BASE= npm run build && npm run preview
```

## 目录

```text
src/
  main.tsx              入口：路由、数据缓存、外观与字体行距
  App.tsx               外壳：当前页面 + 浮动标签栏 / 侧边栏
  components/           跨页面复用的组件（页面外壳、弹出面板、线路色牌、标签栏、侧边栏、分段控制）
  features/board/       看板：手机三档面板（CompactBoard）、平板与桌面多栏（WideBoard）、
                        按站台的发车列表、全线列车位置、车站信息
  features/train/       列车详情（停站、直通、车厢拥挤度）
  features/stations/    车站选择
  features/trip/        行程：规划（CSA）、方案、乘坐指南、实时晚点、收藏与提醒
  features/status/      运行状态：线路状态与通告
  features/tickets/     仿真车票：二维码数字票、票夹、模拟进出站
  features/settings/    设置：服务器、运营方、外观、提醒、本地数据
  lib/                  API 类型与读取、GTFS 与 GTFS-RT、数据 Hook、本站与设置、缓存
  styles/               设计 token 与全局样式
scripts/build-icons.ts  App 图标、favicon.ico 与分享卡片图
```

## 图标

App 图标为「风车」：四条线路色矩形绕中心空方块旋转排列。SVG 与各尺寸 PNG 都由
`scripts/build-icons.ts` 生成：标准图标（iOS、桌面、apple-touch-icon）、自适应图标（PWA
maskable，内容在中心 80% 安全区内）、浏览器标签专用的 favicon（间隙加大、无圆角，另有 favicon.ico），以及 1200×630 的分享卡片图
`public/og-image.png`（文字用 Noto 字体渲染，生成前本机需装有 Noto Sans SC 与 Noto Sans Display）。

## 布局

按可用宽度切换（`src/lib/useLayout.ts`）：小于 768 为手机单栏加可拖动面板；768–1279 为两块（本站发车 / 列车位置）加浮动标签栏；1280 以上换成侧边栏，发车区够宽时按方向再分两栏。车站信息在手机上是底部面板，在大屏上是右上角的弹出卡片。

## 数据

接口说明见 Fetarute-Minecraft-API 的 `docs/api/rail-api.md`。当前使用：

- `GET /v1/rail/catalog`：线路、车站、换乘（线路色也来自这里）
- `GET /v1/rail/servers/{serverId}/stations/{operator}/{station}/board`：站牌
- `GET /v1/rail/servers/{serverId}/gtfs.zip`：GTFS 静态包，用来推出线路站序（catalog 没有站序）与规划行程
- `GET /v1/rail/trains`：在线列车
- `GET /v1/rail/servers/{serverId}/gtfs-rt/trip-updates`、`vehicle-positions`、`alerts`：实时晚点、车厢拥挤度与运营通告（GTFS-RT）

种别（普通 / 快速）暂按交路 ID 推断，等 API 提供种别字段后改为直接读取。

车站在网页地图中的位置用 BlueMap 链接：`https://map.{serverId}.fetarute.org/#{世界}:{x}:{y}:{z}:…`。

## 部署

推送到 `main` 后，GitHub
Actions（`.github/workflows/deploy.yml`）检查格式、类型与单元测试，构建后发布到GitHub
Pages。仓库设置里需要：

- Settings → Pages → Build and deployment 的 Source 选 **GitHub Actions**；
- Custom domain 填 `trainlink.fetarute.info`，并勾选 Enforce HTTPS；DNS 里 `trainlink`
  加一条 CNAME 指向 `team-cenlinc.github.io`。铁路 API 的 CORS 只放行这个域名，用 `*.github.io`
  地址访问时读不到数据。

GitHub Pages 不能把所有路径改写到 `index.html`，所以构建时为已知路由各复制一份 `index.html` （例如
`/status/index.html`，直接打开或分享都返回 200），其余路径（例如 `/tickets/某张票`）由 `404.html`
接住，见 `vite.config.ts` 的 `spaRoutes`。

## 许可

代码以 [MIT 许可证](LICENSE) 发布。以下内容不随代码授权：

- TrainLink 名称与「风车」图标；
- 线路、车站、线路色、时刻与实时数据：来自 Fetarute 铁路 API，归 Fetarute 所有；
- 仿真车票只供体验，不接入任何真实系统，不能乘车。
