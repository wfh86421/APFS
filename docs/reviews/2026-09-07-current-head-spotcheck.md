# ShieldScan — 現行 HEAD P0 抽查報告（2026-09-07）

> **審查基準**：origin/main `76880f3`（`docs: 窗口記錄 M1/M2 與 CI 修復部署（dsh）`）
> **窗口/代號**：REVIEW（現況抽查窗口）
> **方法**：唯讀逐行核對 + 全庫 grep 交叉驗證（未修改任何產品程式碼；本 fresh worktree 未安裝 node_modules，故未重跑單測——revoke/rotate 行為以既有測試 `packages/tenant/test/tenant.test.ts:76-120` 為佐證，其餘以行號引句為證）
> **目的**：重跑 `docs/reviews/ShieldScan-現行HEAD增量複審-報告.md`（基準 ee2ff6e）§2 之 P0 關鍵宣稱，於最新 main 上判定 pass/fail
> **行號皆以 76880f3 為準**

---

## 抽查結果總表（P0 × 5）

| # | 宣稱（增量報告） | 判定 | 證據（76880f3 行號） |
|---|---|---|---|
| P0-1 | 跨租戶物件讀取/刪除無 tenant 比對（server/repository 皆無 tenantId） | ✅ **PASS（已修）** | server.ts:1306,1325,1334,1350-1351,1359,798,1001,1018,1040,812,824-827,841-844,863,1448 全部以 `auth.tenant.tenantId` 呼叫；repository 介面全部 tenantId-first：types.ts:49-58（getReport/deleteReport/getVisitor/deleteVisitor/listReportsByVisitor）、types.ts:227,236,241（listRiskEvents/listReviewCases/listAuditLogs） |
| P0-2 | `review_cases` 無 tenant_id；audit 全域可讀 | ✅ **PASS（已修）** | init.sql:95 `audit_logs.tenant_id UUID`、init.sql:287 `review_cases.tenant_id UUID`（另 risk_events:178、device_fingerprints:224、network_signals:251、api_keys FK:121）；SQL 過濾：risk-postgres.ts:221 `listRiskEvents … 'tenant_id = $1'`、:476/491/511（listReviewCases/getReviewCase/updateReviewCase 皆 `tenant_id=$1`）、:561-564（listAuditLogs `WHERE tenant_id = $1`）、:348-350（devices） |
| P0-3 | `/v1/devices` 資料恆空（upsert 零呼叫者） | ✅ **PASS（已接線）** | server.ts:1263-1268 收案時 `upsertDeviceFingerprint(deviceForScope)`＋`upsertNetworkSignal(buildNetworkSignal(report, tenantId, ip, network))`（註解：僅具身分租戶寫入、匿名 tenant NULL 不寫，維持 owner 邊界）；讀取端點全部租戶過濾 server.ts:807-878 |
| P0-4 | 全站無 CSP/防嵌/STS headers | ✅ **PASS（已修）** | next.config.mjs:10-44 `headers()`：X-Frame-Options DENY(:20)、X-Content-Type-Options nosniff(:21)、Referrer-Policy(:22)、Permissions-Policy(:23)、HSTS(:24)、CSP(:26-40，含 `frame-ancestors 'none'`、`object-src 'none'`、`connect-src` 依 NEXT_PUBLIC_API_URL:14-15,32)；註解明示非ce 化嚴格 CSP 列為後續(:9) |
| P0-5 | API Key 無撤銷/輪換/清單 | ✅ **PASS（已修）** | 路由：GET /v1/tenant/keys server.ts:595、revoke :603-627、rotate :630-664、issue 附角色上限 :570-592；授權：`canAdminKey` :156-160 於 :611-615/:641-645 強制（防低權限動高權限）；store 租戶限定：tenant/store/postgres.ts:148-151（`WHERE key_id AND tenant_id AND revoked_at IS NULL`）、in-memory:42-45；每操作寫審計（含 tenantId）：:585-590/:620-625/:650-661；測試佐證：tenant.test.ts:76-120（revoke 冪等、rotate 同角色、跨租戶 revoke 失敗、撤銷後 verify 失敗、清單帶 revokedAt） |

**另確認（同批次 P0 脈絡，非上表 5 項但屬同一攻擊鏈）**：
- `POST /v1/risk-events` 現限 security_admin 且 `tenantId` 一律以服務端身分覆寫、拒絕 client 自填（server.ts:720-750）→ 增量報告「租戶可偽造任意 severity/rule 事件」已修。
- `GET /v1/public/config/:key` 加 allowlist（僅 homepage，server.ts:753-761）；`PUT /v1/admin/configs/:key` 限 security_admin 並寫審計（:771-786）。
- 報告/訪客刪除與審計端點皆先 `resolveAuth`（server.ts:1443-1449 audit 亦改為需認證＋租戶過濾，不再是公開全表）。

## 殘留觀察（本次範圍外，供後續）

| 項目 | 現況 | 位置 |
|---|---|---|
| 自助註冊仍簽發 **security_admin** 預設 key（RBAC 起點偏高；可自行再加發 security_admin key） | 未改 | tenant/service.ts:57,64（`createTenant`/`issueApiKey` 預設 `'security_admin'`）；server.ts:543-559（註冊 body 無 role 選項，但預設即最高權限） |
| 讀取類敏感操作（報告/訪客/設備/審計查詢）仍未逐筆寫審計（僅寫入/決策類有） | 未改 | 對照 server.ts:1300-1353 與 :585-625/:1336-1343 等 |
| `site_configs` 仍為全域單列（無 tenant 維度），寫入已限 security_admin | 未改 | risk-postgres.ts:600-605（setSiteConfig 無 tenant） |
| CSP 保留 `'unsafe-inline'/'unsafe-eval'`（Next 所需，漸進式） | 未改 | next.config.mjs:29 |

---

*本檔為唯讀抽查產物，未修改產品程式碼。行號以 origin/main `76880f3` 為準；如 main 再推進，請以當下 HEAD 複核。*
