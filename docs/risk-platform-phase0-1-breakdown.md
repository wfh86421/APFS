# 風險偵測管理平台 — Phase 0／1 規劃細拆

> 狀態：執行前定稿（2026-09-06）
> 上層文件：[risk-detection-platform-adopted-plan.md](./risk-detection-platform-adopted-plan.md)

## 範圍選擇

本輪只做「定版與資料契約」兩件事，不動後台 UI 與規則引擎：

- Phase 0：凍結「證據鏈／敏感度／欄位狀態」的型別詞彙。
- Phase 1（契約層）：把 `NormalizedSignal` 可選擇性地掛上證據與敏感度；新增 `RiskEvent` 與 `FieldDefinition` 契約。

## 任務清單（細拆）

### T1 core-schema：列舉與證據型別

- 新增 `Sensitivity`（low/medium/high/critical）。
- 新增 `EvidenceConfidence`（low/medium/high）。
- 新增 `FieldStatus`（active/experimental/deprecated/removed）。
- 新增 `RetentionClass`（short/medium/long/policy）。
- 新增 `SignalEvidence`：source / method / confidence / sensitivity / collectedAt / schemaVersion / rawReference / policy.accessRoles / policy.retentionClass。

驗收：zod 皆 `.strict()`，TS 型別自動推導；非法 enum 會被拒絕。

### T2 core-schema：NormalizedSignal 擴充

- `NormalizedSignal` 增加選填欄位：`evidence`（SignalEvidence）、`sensitivity`。
- 為不破壞既有 SDK／報告，全部選填；既有資料不需遷移。

驗收：舊報告 JSON 仍可通過 `validateEnvironmentReport`。

### T3 core-schema：RiskEvent 契約

- `RiskEventType`：open_ports、os_mismatch、canvas_tampering、dns_leak、webrtc_mismatch、proxy_detected、vpn_detected、tor_detected、blacklist_hit、bot_suspected、geo_velocity_anomaly、fingerprint_instability、timezone_mismatch、language_mismatch。
- `RiskEvent`：eventId / tenantId? / sessionId / reportId? / eventType / severity / confidence / evidenceJson / ruleId / ruleVersion / scoreImpact? / autoAction? / reviewRequired / detectedAt / reviewStatus? / reviewerId? / falsePositiveFlag?。

驗收：可驗證單一風險事件；`severity` 與 `confidence` 使用列舉，避免自由字串。

### T4 core-schema：FieldDefinition（Schema Registry 雛形）

- `FieldDefinition`：fieldPath / displayName / category / sensitivity / defaultConfidence / stability / purpose / retentionClass / accessRoles / uiModule / status / version。

驗收：提供 `validateFieldDefinition`；`status=active|experimental|deprecated|removed` 可被後台目錄使用。

### T5 驗證函式

- 新增 `validateRiskEvent`、`validateFieldDefinition`、`validateSignalEvidence`。

### T6 本機測試

- `pnpm -r build`（至少 core-schema + browser-sdk + api + web）。
- 用 node 執行「正例／反例」驗證：合法 RiskEvent 通過、非法 severity 被拒、既有報告不因選填欄位失效。

## 刻意不做（後續階段）

- risk_events / device_fingerprints / audit_logs 資料表（Phase 1 資料層）。
- 後台 6＋1 模組渲染（Phase 2）。
- 規則引擎雙軌與可解釋分數（Phase 3）。
- RBAC 遮罩與審計 API（Phase 4）。

## 完成定義

1. `core-schema` 編譯通過。
2. 三組新契約通過 zod 驗證（正例與反例）。
3. 既有 `EnvironmentReport` 不需要修改即可通過驗證。

## Phase 1 資料層進度（2026-09-06）

已完成：

- `init.sql` 新增 `risk_events`（含 session/severity/event_type/report 索引）與 `field_definitions`。
- `packages/repository` 新增 `RiskRepository` 介面、`InMemoryRiskRepository`、`PostgresRiskRepository` 與 `createRiskRepository()`。
- 新增測試 `packages/repository/test/risk.test.ts`：InMemory 正例（insert/list/filter/upsert）全數通過；PostgreSQL 整合測試在提供 `DATABASE_URL` 時執行。
- `apps/api` 新增 `POST/GET /v1/risk-events`、`GET/PUT /v1/fields`（皆需 API Key）。
- `scripts/deploy-vps.sh` 在 `docker compose up` 後自動套用 `init.sql`（冪等），既有 volume 也能新增 Phase 1 表。
- `init.sql` 新增 `device_fingerprints`（跨 session 聚類）與 `network_signals`（open_ports/dns_leak 結構化）。
- repository 擴充 `RiskRepository`：`upsert/get/list device_fingerprints`、`upsert/get network_signals`；測試新增 4 個案例（InMemory 8 pass / PG 整合 skip 同前）。

待補（下一輪）：

- `/admin` 6＋1 模組目錄與後台決策頁（Phase 2）。

## Phase 2 進度（/admin 6＋1 模組目錄，2026-09-06）

已完成：

- `apps/web-scanner/src/modules/catalog.ts` 改為定版目錄：
  decision（決策樞紐）、risk（異常矩陣）、network（網路地理）、hardware（硬體指紋）、browser（瀏覽器環境）、raw（原始與稽核）、governance（治理）。
- `ModuleKind` 新增 `governance`；`ModuleItem` 新增 `accessLevel`（restricted 供治理抽屜使用）。
- `raw.payload` 與 `governance.audit` 預設 `visible=false`（不干擾主決策流）。
- `WorkspaceConfig.version` 升為 2，讓舊 localStorage 自動改用新目錄。

待補（Phase 2 後半）：

- `/admin` 報告詳情「決策頁」：依 6＋1 模組順序渲染真實報告欄位（需接 `/v1/reports` 資料）。
- 異常矩陣／決策樞紐卡片元件與快速處置（白名單／標記／封鎖按鈕）。

已完成（2026-09-06）：

- 新增 `/admin/reports/demo` 決策示範頁：依 `loadWorkspaceConfig()` 啟用＋顯示設定渲染 6＋1 模組。
- 決策樞紐（快速處置按鈕）、異常與一致性矩陣、網路地理、硬體指紋、瀏覽器環境、Raw 抽屜、治理抽屜（restricted）。

待補（下一輪）：

- 串接 `/v1/reports`＋風險事件 API，以真實資料取代示範資料。
- 快速處置動作（白名單／標記／封鎖）後端化與審計日誌。
