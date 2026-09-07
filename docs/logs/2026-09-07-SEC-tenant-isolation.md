# SEC — 租戶隔離三刀（commit 364f72a）技術日誌

> 日期：2026-09-07（補記 2026-09-06 完成之 commit 364f72a）
> 代號：SEC（review-agent）｜分支：security/tenant-isolation-r1 → 已合入 main

## 目標
依 Agent Teams code review（基準 ee2ff6e）的三刀修復：租戶隔離、角色收斂、收案自動風險事件。

## 關鍵決策
1. Repository 物件層一律帶 tenantId（getReport/listReportsByVisitor/getVisitor/deleteReport/deleteVisitor；
   risk 層 listRiskEvents/listDeviceFingerprints/listReviewCases/getReviewCase/updateReviewCase/listAuditLogs）。
2. POST /v1/reports 與 /v1/risk-events 的 tenantId 一律由服務端以認證身分覆寫。
3. review_cases/audit_logs 補 tenant_id（init.sql 冪等 ALTER IF NOT EXISTS）。
4. 加發 API Key 不得高於呼叫者角色；site_configs/field_definitions/ip_reputation 寫入與手動 risk-events 限 security_admin。
5. 收案時依 scoring 規則自動產生 RiskEvent 並回填自動 review case 的 riskEventIds。

## 改動檔案（commit 364f72a，fix(security)）
apps/api/src/server.ts、infra/docker/postgres/init.sql、packages/core-schema/src/index.ts、
packages/repository/src/{types,in-memory,postgres,risk-postgres}.ts、
packages/repository/test/{repository,postgres,risk}.test.ts、scripts/verify-prod-storage.mjs
（11 檔，+309/−187）

## 驗證結果
pnpm -r build ✅ / pnpm -r typecheck ✅ / pnpm test ✅（repository 13 pass＋2 skip）
後續由整合窗口完成 CI 全綠、VPS schema 遷移與部署（本窗口未處理）。

## 未完成/待辦
資安 Medium 四項移交 r3 窗口（見 2026-09-07-SEC-security-r3.md）。