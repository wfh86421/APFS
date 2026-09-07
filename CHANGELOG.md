# Changelog

## 2026-09-08（PHASEA）
- Phase A「版面設定（自訂區塊）」主線完成於 `feat/phase-a-blocks`（commit 前綴 df2c940..65d277d，rebase 於 main 76880f3）：M1 dashboard block registry（7 頁/22 區塊）、M2 `dashboard_blocks` 後端持久化、M3 版面 API（tenant 隔離＋audit）、M4 UI（/admin/layout）；並整合「工作台 6+1 即時卡＋原模組資料字典」與「公開首頁 10 區塊管理」。試用站（VPS :3080/:3081，獨立 DB）評判中；正式站部署由整合窗口接手。

## 2026-09-08（dsh）
- M2 設備關聯圖譜 v1 上線並部署（commit 360b60b）
- WP3 成效 ROI 管理頁上線（commit 966cd7c）
- M1「矛盾探測×成效閉環」合併 main（commit ee69a4e）
- CI 修復集＋租戶隔離正式部署（commit ab838c8）

> 版本與重大里程碑紀錄。格式：最新在上；里程碑級才新增。協作規則見 `AGENTS.md`、細目見 `docs/logs/`。

## Unreleased（2026-09-07）

### 安全與治理里程碑（本窗口：3f9df1f..ba315c9）
- P1/P2 增量修復 `3f9df1f`：API Key 撤銷/輪換/清單＋審計軌跡、CSP/安全 headers（api＋web）、`/v1/devices` 寫入接線（device_fingerprints/network_signals）、expires_at 清理（server 排程＋`scripts/cleanup-expired.mjs`）、決策表統一（core-schema `policyDecisionForRiskLevel`）。
- CI 全綠修復三連 `c77ce03`/`0898850`/`ab838c8`：PG 整合測試 tenant 改合法 UUID；`init.sql` site_configs 語法損毀修復（全新 DB 套 schema 不再失敗）；CSP `connect-src` fallback 對齊 api.ts。→ CI #48/#49 與 Verify Prod Storage #21 全綠。
- 文件收錄 `ba315c9`：審查報告進入 `docs/reviews/`（含 README 索引）。

### 併行開發窗口（main 持續推進，自 ab838c8 起）
- m1-wp1 規則引擎活化 `14fc4e4`：伺服器事實進規則、證據鏈規則對齊。
- m1-wp2 IP 速度規則 `8180860`：fingerprint_hash 掛載＋同裝置多 IP 偵測。
- m1-wp3 決策成效閉環 `b931897`：decision_outcomes、POST /v1/outcomes、GET /v1/roi、shadow decision_log。
- m1-wp4 header 一致性 `ee69a4e`：伺服器獨立判定 UA/Client-Hints 矛盾。
- WP3 ROI 視覺頁 `966cd7c`（`/admin/roi`）。
- m2 裝置關聯圖譜 `362b2c6`＋m2-admin 視圖 `360b60b`：sessions/IP/帳號/同 IP 裝置查詢與 API。

### 部署與驗收（2026-09-07）
- 正式庫 schema 遷移完成：`review_cases`/`audit_logs` 補 `tenant_id`（UUID）＋`idx_review_tenant`/`idx_audit_tenant`；新版 init.sql 全量冪等同步（11 個 tenant 欄位／8 個索引）。
- VPS 部署 `ab838c8` 版本並通過實測驗收（key 清單/撤銷/輪換/審計、安全 headers、頁面 200）。

## 待辦/開放
- port 硬化：compose 5432/6379 由 0.0.0.0 改綁 127.0.0.1。
- 公開站台（tenant_id=NULL）與租戶資料的 owner 邊界決策（舊 review_cases/audit_logs 8/12 筆為 NULL）。
- 增量審查其餘 Medium：XFF 信任、限流 429、audit 身分欄、webhook SSRF 面。
