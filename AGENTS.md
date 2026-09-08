# APFS / ShieldScan — 協作規範（所有並行 agent 必讀）

本專案由多組並行 agent 共同開發（同一 repo：本機 `歸檔`、GitHub `wfh86421/APFS`、VPS `/root/APFS`）。
**啟動任何工作前先讀本檔；每個窗口結束前依 §記錄 寫入並推送。**

## 1. 專案速覽
- pnpm monorepo：`packages/*`（core-schema/repository/tenant/scoring-engine/signing/network-intel/port-scanner/browser-sdk/node-sdk/react-sdk/plugin-*/policy-engine）、`apps/api`（Fastify）、`apps/web-scanner`（Next 15）。
- 資料層：PostgreSQL 16（`infra/docker/postgres/init.sql` 為唯一 schema 事實來源，CI/部署以 `node scripts/init-db.mjs` 套用，**冪等可重跑**）+ Redis。
- 安全紅線：多租戶資料一律以 `tenant_id` 隔離（欄位皆 UUID）；匿名資料 = tenant NULL（公共）；不得移除租戶過濾。

## 2. 記錄位置（每個窗口必須寫）
| 內容 | 檔案 | 規則 |
|---|---|---|
| 版本＋重大里程碑 | 根目錄 `CHANGELOG.md` | 里程碑級才新增一行（日期＋內容＋commit 前綴），置於最上方段落 |
| 技術日誌（每窗口一檔） | `docs/logs/YYYY-MM-DD-<代號>-<主題>.md` | **檔名唯一**，禁止覆蓋他人檔案 |
| 審查報告 | `docs/reviews/<主題>.md` | 檔名含審查基準 commit |
| 追蹤/驗證 | `docs/validation-tracker.md`、`docs/verification-*.md` | 更新時同步 |

技術日誌每筆含：目標 → 關鍵決策 → 改動檔案（含 commit 前綴）→ 驗證結果 → 未完成/待辦。

## 3. Git 協作規約
- 開新分支命名：`feat/<主題>`、`fix/<主題>`、`docs/<主題>`、`chore/<主題>`。
- **禁止直接改他人窗口的日誌檔；禁止 force-push 到 main。**
- 推送前一律 `git pull --rebase origin main`；衝突時保留雙方內容再提交。
- commit 訊息前綴慣例：`feat:` `fix:` `docs:` `ci:` `chore:`；docs 類含 `（<代號>）`。
- 合併到 main：fast-forward 或 rebase 後推送；大功能建議先開分支跑 CI 再合。

## 4. 驗證指令（本機/CI 一致）

```bash
# 全部套件型別檢查與建置
pnpm -r typecheck && pnpm -r build
# 單元測試（不含 DB）
pnpm test
# 真實 Postgres 整合（需 DATABASE_URL；CI 的 postgres service 已含）
pnpm test:postgres
# schema 套用（冪等）
node scripts/init-db.mjs
# E2E（apps/web-scanner）
pnpm --filter @shieldscan/web-scanner e2e
```
- CI 全流程：Build → Typecheck → Apply schema → Unit tests → test:postgres → verify-prod-storage → E2E（GitHub Actions `ci.yml`；另有 `verify-prod-storage.yml` 於 main push 觸發）。
- **「本機綠 ≠ CI 綠」**：凡觸及 schema/SQL/測試 tenant 值，務必以真實 Postgres 驗證（UUID 型別欄位不接受非 UUID 字串）。

## 5. 部署
- VPS `/root/APFS`（docker compose）；流程見 `docs/deploy-vps.md`。
- 上線前先跑 schema 同步（新版 init.sql 冪等），再重建 api/web 映像。
- 5432/6379 對外綁定問題（0.0.0.0）屬已知待辦：改 127.0.0.1 前請確認內網連線路徑。
- **並行試用站＝備用站（禁止關閉）**：VPS `http://107.174.241.48:3080/`（web）與 `:3081`（api）對應 `shieldscan-trial` 堆疊（compose `/root/shieldscan-trial`、程式 `/root/shieldscan-trial-code`、獨立 DB、build 旗標 `NEXT_PUBLIC_EXPERIENCE=overview`）。**未經使用者明確指示，不得關閉／停止／刪除／重設該堆疊或其資料**；正式站改版前先在試用站驗證；試用站與正式站同版本程式時作為備援。

## 6. 已知脈絡（供追溯）
- 完整審查報告：`docs/reviews/`（基準 cfbb540 / ee2ff6e）。
- 定版規劃：`docs/risk-detection-platform-adopted-plan.md`；追蹤：`docs/validation-tracker.md`。
