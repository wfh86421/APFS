# 窗口記錄 — 2026-09-08（dsh）

- 代號：dsh（DeepSeek Harness agent）
- 基準/合併：本窗口成果已合併進 main（`ab838c8 → 360b60b`；另含 coord-docs `ba315c9/666e336`）
- 關聯：CHANGELOG 里程碑行、docs/validation-tracker 未動

## 目標
1. 讓 main 的 CI 轉綠（先前 364f72a 起全紅）並把租戶隔離正式部署。
2. 完成 M1「矛盾探測×成效閉環」（規則活化／伺服器事實／成效閉環／header 一致性）。
3. WP3 補 admin ROI 視覺頁；完成 M2「設備關聯圖譜 v1」（查詢＋API＋admin 視圖）。

## 關鍵決策
- **CI 紅因修復（本機綠≠CI 綠三案例）**：① `init.sql` site_configs 的 CREATE TABLE 被註解黏連（全新 DB 套 schema 必失敗）② repository PG 整合測試用非 UUID tenant（UUID 欄位 22P02）③ web CSP `connect-src` 未放行預設 API 位址（E2E standard 上送被擋）。
- **規則引擎**：以「伺服器事實」餵規則（不信任客戶端自報為唯一來源）；維持租戶隔離與「高風險≠自動封鎖」紅線。
- **成效閉環**：新增 outcome 回饋模型（enforced 決策 vs shadow 反事實分離），ROI 以「詐欺結果×當時決策」聚合，避免賣數據、改賣決策成效。
- **圖譜 v1 用 RDBMS 內建**（不先遷圖資料庫）：fingerprint_scans 掛 `fingerprint_hash` 做 device↔IP↔session 邊。
- 共用 repo 與並行 agent：所有 git 網路操作單獨 worktree 進行，避免互相干擾 checkout。

## 修改檔案（含 commit 前綴）
- **CI/信任修復**
  - `fix(ci): 修復 init.sql site_configs 語句被註解黏連…`（`0898850`）→ `infra/docker/postgres/init.sql`
  - `fix(ci): repository PG 整合測試 tenantId 改用合法 UUID…`（`c77ce03`）→ `packages/repository/test/{postgres,risk}.test.ts`
  - `fix(e2e): CSP connect-src 與 api.ts fallback 對齊…`（`ab838c8`）→ `apps/web-scanner/next.config.mjs`
- **M1 WP1**（`14fc4e4`）：`packages/core-schema`、`packages/scoring-engine`（defaultRules 對齊＋server 事實規則）、`apps/api/src/server.ts`（serverNetworkIssues/events）、`packages/scoring-engine/test/rules.test.mjs`（新增 node --test）
- **M1 WP2**（`8180860`）：`infra/docker/postgres/init.sql`（fingerprint_hash＋索引）、`packages/repository`（ReportMeta/`listRecentClientIps`，PG/in-memory）、`apps/api`（IP velocity issue）
- **M1 WP3**（`b931897`）：`init.sql`（decision_outcomes）、`packages/repository`（OutcomeEntry/recordOutcome/listOutcomes）、`apps/api`（POST /v1/outcomes、GET /v1/roi、shadow decision_log）
- **M1 WP4**（`ee69a4e`）：`packages/scoring-engine`（server_header_incoherence 規則）、`apps/api`（headerCoherenceIssues）
- **ROI admin UI**（`966cd7c`）：`apps/web-scanner/src/app/admin/roi`、`components/admin/{roi-view,admin-nav}.tsx`
- **M2**（`362b2c6` backend、`360b60b` admin）：`packages/repository`（listSessionsByFingerprint/listFingerprintsByIp）、`apps/api`（/v1/devices/:hash/relations、/v1/devices/by-ip）、`apps/web-scanner`（`admin/devices/[hash]`＋device-relations）
- 前置（前一窗口）P1/P2 修復 `3f9df1f`（API Key revoke/rotate/list＋審計、安全 headers、devices 接線、expires 清理、demo 決策對齊）——本窗口驗證並部署。

## 驗證結果
- CI：fix/r2 #48（14/14）→ main #49＋Verify #21 → M1 WP1-4（#56–#59 全 14/14）→ main #60＋Verify #22 → ROI #61/#62 → M2 #64/#65＋Verify #23 → 全部全綠（Build→Apply schema→Unit tests→test:postgres→verify-prod-storage→E2E）。
- VPS 正式部署：schema 同步（review_cases/audit_logs tenant_id＋索引、fingerprint_hash、decision_outcomes 實測存在）＋映像重建；smoke：/v1/outcomes、/v1/roi（prevented NT$500、shadow 1）、/v1/devices relations（3 sessions/3 IP/3 帳號＋同 IP 他裝置）、by-ip、未授權 401、UI 頁面 200。
- 圖譜 smoke 用與收案同結構的種子資料（正式環境帶 key 收案有簽章校驗）；真實 ingest 路徑由 CI 整合/E2E 覆蓋。

## 未完成／待辦
- VPS compose 5432/6379 對外綁定（0.0.0.0）→ 改 127.0.0.1（改前確認內網路徑；AGENTS §5）。
- 圖譜下一階：stability/entropy 實算落庫、review case↔device 串接、多租戶聚類（含 owner 邊界決策）。
- 複審殘留 Medium：XFF 信任/SSRF、限流 429、audit 身分、webhook 簽章。
- 並行試營運堆疊 `shieldscan-trial-*` 在 VPS（由使用者審核是否合併，agent 不代動）。
