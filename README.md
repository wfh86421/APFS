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

## Phase 2 狀態（2026-08-29）

- **報告儲存與歷史比對**：`packages/repository`（InMemory 開發用 + PostgreSQL 生產用，schema 見 [infra/docker/postgres/init.sql](./infra/docker/postgres/init.sql)）；`GET /v1/reports/{id}`、`GET /v1/visitors/{visitorId}/reports`（同 visitor 跨 IP 追蹤）已可用。
- **L0/L1 網路層**：`packages/network-intel`（GeoIP mock/ip-api 雙提供者、Proxy/VPN/Tor/DataCenter 判斷、WebRTC 一致性、DNS leak 比對）；已知樣本分類準確率 100%（驗收 ≥95%）。
- **合規端口檢測**：`packages/port-scanner` + `POST /v1/port-scan`——只掃請求者來源 IP、每 IP 每小時 5 次限流、審計日誌（`GET /v1/audit-logs`）。
- **Server 端信任錨點**：`POST /v1/reports` 自動附加 HTTP headers 訊號（TLS JA4/TCP 介面預留），並回傳網路分析。
- **網站串接完成**：同意模式分流——local-only 全部留在本機；standard / stored 上傳 `POST /v1/reports`，採用伺服器評分、policy 與網路分析（Proxy/VPN/Tor/DC、WebRTC 一致性、DNS leak），伺服器失敗時自動降級為本機預覽並提示。API 位址由 `NEXT_PUBLIC_API_URL` 設定（見 [apps/web-scanner/.env.example](./apps/web-scanner/.env.example)）；API 已啟用 CORS（`CORS_ORIGIN` 環境變數可覆寫）。
- **完整性**：SDK `buildReport()` 會對信封（nonce/timestamp/sdkVersion）產生 SHA-256 自雜湊指紋作為 `integrity.signature`（防篡改；正式伺服器簽章屬 Phase 3）；伺服器儲存報告時會把當下網路分析併入 `raw.network`，歷史可回溯。
- **驗證**：repository 3/3、network-intel 4/4、port-scanner 2/2 測試通過；`pnpm -r typecheck` 與 API build 通過；API 冒煙測試（報告儲存/查詢/歷史/網路/限流/審計）全數通過。
- **資料刪除（個資請求）**：`DELETE /v1/reports/{id}`（單筆）與 `DELETE /v1/visitors/{visitorId}`（被遺忘權，含全部報告），操作皆寫審計。
- **Phase 2 驗證報告**：[docs/verification-phase2.md](./docs/verification-phase2.md) — API 冒煙 15/15、P99=17.9ms、網路樣本準確率 100%、同 visitor 跨 IP 追蹤、限流/審計/刪除全數通過。
- **待辦**：docker compose 啟 PostgreSQL/Redis 後切正式儲存（執行期驗證）、ip-api 金鑰/額度設定、JA4/TCP 真實指紋（需邊緣層）、部署上線累積自然流量。

## Phase 3 狀態（2026-08-29）

- **租戶 / API Key / 計費**：`packages/tenant`（自助註冊、`shd_live_` 金鑰簽發與雜湊儲存、用量紀錄、發票產生）；`POST /v1/tenants`、`GET /v1/tenant/me`、`POST /v1/tenant/keys`、`GET /v1/billing/current`、`POST /v1/billing/invoices/current`。
- **正式簽章**：`packages/signing`（HMAC-SHA256，Web Crypto 瀏覽器/Node 通用）；browser-sdk `buildReport` 支援 `signingSecret`；API 對租戶強制驗證簽章（竄改/過期 → 401）。
- **Webhook 風險通知**：`POST /v1/webhooks` 註冊（https，本地 localhost 例外），高風險報告自動推送 `risk_event`（3 秒逾時、重試 1 次）。
- **SDK npm 打包**：core-schema / browser-sdk / react-sdk / node-sdk / signing 皆含 license、publishConfig、prepack；`pnpm pack` 驗證 tarball（`workspace:*` 自動改寫為版本號）；[SDK 整合文件](./docs/sdk-integration.md) + [Node demo](./examples/node-demo)。
- **定價頁**：[/pricing](./apps/web-scanner/src/app/pricing/page.tsx)（Free / Developer NT$2,500 / Business NT$25,000 / Enterprise 報價制）。
- **CI Postgres 執行期驗證**：workflow 新增 postgres + redis service；`pnpm test`（單元）→ `node scripts/init-db.mjs`（套用 schema）→ `pnpm test:postgres`（repository 整合）→ `node scripts/verify-prod-storage.mjs`（正式儲存切換：報告落庫/查詢/歷史/P99<500ms/刪除權）。
- **驗證**：`pnpm -r typecheck`、`pnpm -r build`、`pnpm test` 全數通過；Phase 3 冒煙 9/9（註冊/簽章/竄改 401/高風險 block/Webhook 送達/用量/發票/刪除權）。

## Docker 本地鏡像與 VPS 上線（2026-08-29）

- **鏡像**：`apps/api/Dockerfile`（多階段）與 `apps/web-scanner/Dockerfile`（Next.js standalone）；根目錄 `docker-compose.yml` 一次啟動 Postgres/Redis/API/網站。
- **本機驗證**（需 Docker Desktop）：

```bash
cp .env.example .env   # 編輯正式值
docker compose up -d --build
node scripts/smoke-compose.mjs   # 期望 5/5 通過（網站/匿名報告/租戶簽章/Postgres 落庫）
```

- **VPS 上線**：`scripts/deploy-vps.sh`（git pull → build → up → 冒煙）；完整步驟、上線檢查清單、Caddy HTTPS、備份排程見 [docs/deploy-vps.md](./docs/deploy-vps.md)。

## 測試

```bash
# 全 workspace 型別檢查與建置
pnpm -r typecheck
pnpm -r build

# 端到端測試（首頁/同意機制/掃描流程/JSON 匯出/隱私頁/掃描耗時 P95<3s）
pnpm --filter @shieldscan/web-scanner e2e
```

Phase 0/1 驗證指標檢核：見 [docs/verification-phase0-1.md](./docs/verification-phase0-1.md)。

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
