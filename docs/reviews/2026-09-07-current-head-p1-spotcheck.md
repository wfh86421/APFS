# ShieldScan — 現行 HEAD P1 第二波抽查報告（2026-09-07）

> **審查基準**：origin/main `9695432`（`Merge remote-tracking branch 'origin/feat/phase-a-blocks'`）
> **窗口/代號**：REVIEW（現況抽查窗口）｜前一報告：`2026-09-07-current-head-spotcheck.md`（P0，基準 76880f3）
> **方法**：唯讀逐行核對＋grep 交叉驗證（未修改產品程式碼；fresh worktree 無 node_modules，未重跑單測）
> **目的**：複查增量報告 `ShieldScan-現行HEAD增量複審-報告.md`（基準 ee2ff6e）§2 P1/相關 P2 宣稱在最新 main 的狀態
> 行號皆以 `9695432` 為準

---

## 抽查結果（P1 主軸 10 項＋相關 P2 3 項）

| # | 宣稱 | 判定 | 證據（9695432 行號） |
|---|---|---|---|
| 1 | 決策鏈空洞：收案不自動產生 risk_events、review case 空 riskEventIds | ✅ **PASS（已落地）** | `eventsFromScore`（server.ts:504-536，RULE_EVENT_TYPE 對照 :488-501）於收案自動 `insertRiskEvents(events)`（:1359-1362）；high/critical 自動 `createReviewCase` 並回填 `riskEventIds`（:1363-1376） |
| 2 | defaultRules 斷鏈（多數規則永不觸發） | ✅ **PASS（大幅改善）** | 伺服器事實以 serverNetworkIssues/velocity/header 併入評分（server.ts:1312-1338）；scoring-engine 新增 server_* 規則並與 producer type 對齊（scoring-engine/src/index.ts:216-273）；RULE_EVENT_TYPE（server:488-501）涵蓋新規則。客戶端自報 issues 仍併入（:1333），建議後續只信 server 事實 |
| 3 | 定版規則引擎（policy-engine）未落地 | ❌ **FAIL（仍死碼）** | `@shieldscan/policy-engine` 在 apps/services 零引用（server.ts grep 無命中）；決策仍由 scoring-engine + `scoreToPolicy` 內建（server.ts:1340） |
| 4 | 簽章仍不可作為安全閘 | ❌ **FAIL（未改）** | 全域單一 `REPORT_SIGNING_SECRET`（server.ts:96）；未設定即 `{ required:false, verified:null }` 整段停用（:281）；canonical 仍僅 7 欄、不含 subjectId/consent/tenantId/issues（signing/src/index.ts:33-46）。註：webhook 投遞已加 `sha256=` HMAC header（server.ts:317-319），同 secret 但為投遞鑑別用 |
| 5 | site_configs 全域單列可被任一租戶覆寫 | 🟡 **部分 PASS** | `PUT /v1/admin/configs/:key` 限 security_admin＋審計（server.ts:771-786）；public 端 allowlist 僅 homepage（:753-761）；但 `site_configs` 仍為無 tenant 維度之全域列（risk-postgres setSiteConfig）。phase-a 的 `dashboard_blocks` 已含 tenant_id（risk-postgres.ts:741） |
| 6 | security_admin key 明文存 localStorage＋無路由守衛 | ❌ **FAIL（未改）** | `register-form.tsx:27` 與所有 admin components 讀寫 `shieldscan.admin.apiKey`（admin-page.tsx:57-97、overview/reports-list/events-list/devices-list/report-detail… 多檔）；未見 admin 路由守衛/middleware；CSP 仍含 `unsafe-inline/unsafe-eval`（next.config.mjs:29） |
| 7 | deleteVisitor 不連動 risk/device/review（GDPR 級聯不全） | ❌ **FAIL（未改）** | `deleteVisitor` 僅刪 fingerprint_scans + visitor_profiles（postgres.ts:311-325）；risk_events/review_cases/device_fingerprints/network_signals/decision_outcomes/audit_logs 未級聯（這些表在另一 risk repository/pool） |
| 8 | expires_at 只寫不讀、無清理 job | ✅ **PASS（已落地）** | `deleteExpiredReports`：postgres.ts:303-308（`WHERE expires_at IS NOT NULL AND expires_at < $1`）、in-memory.ts:195；`startExpiryCleanup`（server.ts:1772-1792，DB 才啟動、預設 6h 間隔、`timer.unref()`） |
| 9 | 資料層六層只落地四層 | ❌ **FAIL（未改）** | init.sql 現有 19 張表，仍缺 `environment_reports / session_overview / retention_policies / consent_records / model_versions / score_explanations` |
| 10 | `/v1/devices` 恆空轉（零呼叫者） | ✅ **PASS**（P0 已記，此處確認未回退） | 收案接線 server.ts:1397-1403（僅租戶）；listDeviceFingerprints 租戶過濾 |
| 11 | API Key 無撤銷/輪換 | ✅ **PASS**（P0 已記，未回退） | server.ts revoke/rotate＋tenant store |
| 12 | 詳情頁 fraudScore 鏡像偽造 | ❌ **FAIL（未改）** | report-detail.tsx:92 `fraudScore: 100 - (body.privacyScore ?? 0)`（真實報告頁仍在鏡像） |
| 13 | local-only 仍走公開 STUN | ❌ **FAIL（未改）** | browser-sdk webrtc.ts:17-19 Google/Twilio STUN |

**補充判定（與 tracker 同步）**：敏感「讀取」操作（報告/訪客/設備/審計查詢）仍未逐筆寫審計（僅寫入/決策類端點有 appendAuditLog）——維持 🟡。

---

## 小結
相比 ee2ff6e 基準，**證據鏈（自動 risk events＋開 case 回填）、伺服器事實評分規則、expires_at 清理** 三塊已落地（1/2/8 PASS）。仍掛紅的是治理收尾類：admin key 明文＋無守衛（6）、GDPR 級聯（7）、六層資料層（9）、簽章信任模型（4）、policy-engine（3）、詳情頁鏡像（12）、STUN（13）——多數與 `security/tenant-isolation-r1` 窗口及後續 phase 的職權重疊，建議由 coord 分派，避免 REVIEW 重複開修。

---

*本檔為唯讀抽查產物，未修改產品程式碼。行號以 origin/main `9695432` 為準。*
