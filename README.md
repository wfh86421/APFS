# ShieldScan（隱盾檢測）

瀏覽器指紋與網路環境安全檢測平台 — **環境可信度基礎設施**。

## 定位

前台是免費/半免費的瀏覽器指紋檢測工具，後台沉澱匿名化、合規化、可驗證的真實環境資料，最終對外提供 SDK、API、風險評分、反詐欺、反自動化、裝置可信度、環境一致性驗證等能力。

- **網站是入口**：免費檢測網站負責吸引使用者、建立信任、沉澱資料。
- **插件化 Kernel 是骨架**：檢測模組、評分規則、輸出渠道全部可插拔。
- **L0–L5 跨層一致性是判斷力**：伺服器端網路指紋（JA4/TCP）為信任錨點，與客戶端硬體/瀏覽器/行為訊號交叉驗證。
- **SDK/API 是商業化管道**：任何軟體、網站、App、插件、API 服務都能串接。
- **真實環境資料庫是最終不可替代的資產**。

## Monorepo 結構

```text
apps/          應用層：web-scanner、developer-portal、dashboard、streaming-demo、api
packages/      共享套件：core-schema、plugin-runtime、scoring-engine、policy-engine、browser-sdk、react-sdk、node-sdk
mobile/        行動端 SDK：android-sdk、ios-sdk
plugins/       可插拔檢測/分析/評分/政策/輸出插件
services/      獨立服務：ingestion-api、scanner-service、dns-stun-service、reputation-service
infra/         基礎設施：Docker、監控、IaC
docs/          技術文件
```

## Phase 0 狀態（2026-08-28）

- **core-schema v0.1.0 定稿**：`EnvironmentReport` / `NormalizedSignal` / `ScoreBundle` / `PluginManifest` 全部由 zod schema 推導，附執行期驗證與 `SCHEMA_VERSION`。
- **plugin-cli**：`shieldscan-plugin validate <manifest.json>` 驗證 PluginManifest（通過 exit 0，失敗 exit 1，可進 CI）。
- **OpenAPI 契約**：[docs/openapi.yaml](./docs/openapi.yaml) 為唯一 API 契約來源（/v1/reports、/v1/analyze、/v1/scoring/calculate、/v1/plugin-profile）。
- **API 雛形**：`POST /v1/reports` 已實作「契約驗證 → 評分 → policy」，其餘端點 501 待 Phase 2/3 接入。
- **端到端驗證通過**：`pnpm install && pnpm -r build`；`POST /v1/reports` 對示範報告回傳 85 分（os_mismatch -5、dns_leak -10）。

## Phase 1 狀態（2026-08-28）

- **browser-sdk 10 個採集模組**：ua、clientHints、canvas、webgl、webgpu、audio、screen、locale、timezone、webrtc；`ScanSession` 支援即時進度事件；新增 `buildReport()` 組裝完整 `EnvironmentReport`。
- **檢測網站功能完成**：一鍵掃描 + 進度列、分區報告（Overview / Issues / Hardware / Browser / Network）、四維本地評分、JSON 匯出。
- **同意機制**：local-only / standard / stored 三模式（localStorage 記憶），[隱私政策頁](./apps/web-scanner/src/app/privacy/page.tsx) 已建立。
- **驗證**：`pnpm -r typecheck`、`pnpm -r build`（含 Next.js production build）全數通過；`/` 與 `/privacy` HTTP 200。
- **待辦**：部署上線、自然流量驗證（月掃描 ≥5,000）、`POST /v1/reports` 由網站串接（Phase 2）。

## 規劃文件

本儲存庫根目錄同時存放各來源 AI 的規劃文件與最優合併方案：

- [ShieldScan-0-1到商業化完整規劃.md](./ShieldScan-0-1到商業化完整規劃.md) — 0-1 到商業化完整路徑（本專案行動綱領）
- [ShieldScan-最優合併方案規劃書.md](./ShieldScan-最優合併方案規劃書.md) — 最優合併方案（本專案總綱）
- [瀏覽器指紋檢測平台-合併最優解與商業化護城河規劃.md](./瀏覽器指紋檢測平台-合併最優解與商業化護城河規劃.md)
- [瀏覽器指紋檢測平台-0-1插件化核心平台架構規劃.md](./瀏覽器指紋檢測平台-0-1插件化核心平台架構規劃.md)
- [kimi 瀏覽器指紋檢測平台-0-1插件化核心平台架構規劃.md](./kimi 瀏覽器指紋檢測平台-0-1插件化核心平台架構規劃.md)
- [kimi.ShieldScan_Architecture_Plan.md](./kimi.ShieldScan_Architecture_Plan.md)
- [DeepSeek-瀏覽器指紋檢測平台規劃.md](./DeepSeek-瀏覽器指紋檢測平台規劃.md)
- [grok-Browser-Fingerprint-Network-Environment-Scanner-網頁專案規劃.md](./grok-Browser-Fingerprint-Network-Environment-Scanner-網頁專案規劃.md)
- [瀏覽器指紋檢測平台-網頁專案計畫與技術架構 Qwen3.8-Max.txt](./瀏覽器指紋檢測平台-網頁專案計畫與技術架構 Qwen3.8-Max.txt)

## 開發

```bash
pnpm install
pnpm -r --filter "./packages/**" build   # 依賴順序建置全部套件
pnpm -r typecheck                       # 全 workspace 型別檢查
pnpm --filter @shieldscan/web-scanner dev
pnpm --filter @shieldscan/api dev
```

Node.js >= 22，套件管理使用 pnpm workspace。

### PluginManifest 驗證

```bash
pnpm --filter @shieldscan/plugin-cli build
node packages/plugin-cli/dist/cli.js validate plugins/detection/browser.canvas/manifest.json
```

### API 冒煙測試

```bash
pnpm --filter @shieldscan/api build
node apps/api/dist/server.js
curl -X POST http://localhost:3001/v1/reports \
  -H 'Content-Type: application/json' \
  --data @docs/examples/report.example.json
```
