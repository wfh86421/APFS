# 本地完整運行與測試指南

> 目標：一台新機器上，把 ShieldScan 的全部功能與全部測試跑起來。
> 兩種模式：**A. Docker 一次到位（推薦，涵蓋正式儲存）** 與 **B. 純開發模式（無 Docker）**。

## 0. 環境需求

- Node.js ≥ 22（建議 22 LTS）
- pnpm 11（`npm i -g pnpm@11.19.0` 或啟用 corepack）
- Git
- **Docker Desktop**（可安裝：<https://www.docker.com/products/docker-desktop/>）— 方式 A 需要

## 1. 安裝

```bash
git clone git@github.com:wfh86421/APFS.git
cd APFS
pnpm install
```

## 2. 方式 A：Docker 一次到位（推薦）

```bash
# 1) 環境變數
cp .env.example .env
# 編輯：POSTGRES_PASSWORD、REPORT_SIGNING_SECRET 換成正式隨機值

# 2) 建置並啟動全部服務（Postgres / Redis / API / 網站）
docker compose up -d --build
# 第一次會下載 base image 與 npm 套件，需數分鐘

# 3) 確認健康
curl http://localhost:3001/health        # {"status":"ok",...}
curl -I http://localhost:3000           # HTTP/1.1 200

# 4) 完整驗證：compose 堆疊冒煙 + 正式儲存切換驗證
pnpm verify:compose
# 期望：smoke-compose 5/5 通過；verify-prod-storage 全數通過（含 P99<500ms、刪除權）

# 5) 手動功能測試
# 開啟 http://localhost:3000
#   → 同意機制（local-only / standard / stored）
#   → 開始掃描 → 分區報告 → 四維評分 → JSON 匯出
# API（租戶 / 計費 / Webhook）範例見 docs/sdk-integration.md

# 結束
docker compose down
```

## 3. 方式 B：純開發模式（無 Docker）

```bash
# 1) 啟動內嵌 PostgreSQL + Redis（自動套用 schema）
pnpm dev:db        # 保持執行；Ctrl+C 停止

# 2) 開發伺服器（另開兩個終端）
pnpm dev:api       # http://localhost:3001
pnpm dev:web       # http://localhost:3000
```

> 已知限制：Windows 沙箱/受限環境下 embedded-postgres 的 initdb 可能失敗，一般終端機或 CI 可用。

## 4. 全部測試清單

| 測試 | 指令 | 涵蓋 |
|---|---|---|
| 型別檢查 | `pnpm -r typecheck` | 全 workspace TypeScript |
| 建置 | `pnpm -r build` | 全部套件 + Next.js production build |
| 單元測試 | `pnpm test` | signing 5 / tenant 4 / repository 4 / network-intel 4 / port-scanner 2 |
| Postgres 整合 | `DATABASE_URL=postgres://... pnpm test:postgres` | repository 對真實 PG（無 DATABASE_URL 自動 skip） |
| 正式儲存切換 | `pnpm verify:prod-storage` | 內嵌 DB + 自動啟動 API：落庫/查詢/歷史/P99<500ms/刪除權 |
| Compose 完整驗證 | `pnpm verify:compose` | 需先 `docker compose up -d --build` |
| E2E（Playwright） | 先 `pnpm --filter @shieldscan/web-scanner exec playwright install chromium`，再 `pnpm test:e2e` | 自動啟動 dev server；首頁/同意/掃描/耗時<3s/JSON 匯出/隱私頁 |
| 全部一次 | `pnpm check && pnpm test:e2e` | typecheck + build + 單元 + E2E |

## 5. 新機器建議順序

```bash
pnpm install
pnpm check                                    # 型別 + 建置 + 單元
pnpm --filter @shieldscan/web-scanner exec playwright install chromium
pnpm test:e2e                                 # 瀏覽器端到端
docker compose up -d --build
pnpm verify:compose                           # 正式儲存驗證
# 最後手動瀏覽 http://localhost:3000 做全功能確認
```

## 6. 常見問題

- **Port 衝突**：改 `.env` 或 `docker-compose.yml` 的 ports 映射。
- **compose 內 GeoIP 是 mock**：正式環境 `.env` 設 `NETWORK_PROVIDER=ip-api`。
- **`verify:compose` 找不到 API**：確認 `docker compose ps` 中 api 為 healthy/running。
- **Windows 跑 bash 腳本**：`deploy-vps.sh` 在 VPS/Linux 執行；本機請用 Git Bash/WSL，或直接照 docs/deploy-vps.md 的指令手動執行。
- **E2E 與 dev server port 衝突**：Playwright 會自動啟動 dev server（reuseExistingServer 已開啟，本機已有 server 時會沿用）。
- **Windows 建置與 standalone**：本機一般 `pnpm build` 不會產生 standalone 輸出（避免 Windows 無 symlink 權限時失敗）；Docker 建置時會以 `NEXT_OUTPUT_STANDALONE=1` 啟用（Linux 無此限制）。
