# 窗口日誌 — REVIEW（現況抽查）2026-09-07

> 代號：REVIEW　窗口：現況抽查窗口　基準：origin/main `76880f3`

## 目標
依協調指示，以最新 origin/main 重跑增量複審報告（docs/reviews/ShieldScan-現行HEAD增量複審-報告.md，基準 ee2ff6e）的 P0 關鍵宣稱抽查：①tenant 隔離路由 ②review_cases/audit_logs tenant_id ③devices 寫入 ④CSP headers ⑤key revoke/rotate。只讀驗證，不改產品程式碼。

## 關鍵決策
- 6c3f worktree 已被他窗口（security/tenant-isolation-r1）佔用 → **另建獨立 worktree** `C:\Users\User\.codex-deepseek\worktrees\review-spotcheck`，分支 `review/spotcheck-main` 以 origin/main 為基底。
- 抽查以「唯讀逐行核對＋全庫 grep 交叉驗證」進行；fresh worktree 未裝 node_modules，故未重跑單測——revoke/rotate 以既有測試 tenant.test.ts:76-120 佐證，其餘以行號引句佐證。
- 文件變更依 AGENTS.md 規範：審查報告放 docs/reviews/、窗口日誌放 docs/logs/（檔名唯一 `2026-09-07-REVIEW-spotcheck.md`）、同步更新 validation-tracker。

## 改動檔案（commit 前綴 docs（REVIEW））
- `docs/reviews/2026-09-07-current-head-spotcheck.md`（新增）— P0×5 抽查表（pass/fail＋行號）與殘留觀察
- `docs/validation-tracker.md` — B 兩列（敏感存取日誌／未授權存取）與 C「設備指紋」證據更新、標頭日期、G 補記
- `docs/logs/2026-09-07-REVIEW-spotcheck.md`（新增，本檔）

## 驗證結果（基準 76880f3）
- P0-1 tenant 隔離路由：**PASS** — server/repository 全線 tenantId-first（server.ts:1306,1325,1334,1350-1359,798,1001,1018,1040,812,1448；types.ts:49-58,227,236,241）
- P0-2 review_cases/audit_logs tenant_id：**PASS** — init.sql:95/287 已含 tenant_id；risk-postgres 查詢全 `tenant_id=$1`（:221,350,476,491,511,561-564）
- P0-3 devices 寫入：**PASS** — 收案已接線（server.ts:1263-1268，僅租戶寫入）；/v1/devices、by-ip、relations 租戶過濾（:807-878）
- P0-4 CSP headers：**PASS** — next.config.mjs:10-44（CSP/XFO DENY/HSTS/nosniff/frame-ancestors 'none'）
- P0-5 key revoke/rotate：**PASS** — 路由+角色防升等+租戶限定 store+審計（server.ts:595-665；tenant/store/postgres.ts:148-151）；測試 tenant.test.ts:76-120
- 另確認：risk-events 手動建立限 security_admin 且 tenantId 服務端覆寫（server.ts:720-750）；public config allowlist（:753-761）

## 未完成／待辦
- 殘留（已列報告）：註冊預設 security_admin（tenant/service.ts:57,64）；讀取類敏感操作未逐筆審計；site_configs 全域單列；CSP 非ce 化嚴格化。
- 本 worktree 未跑單測/curl（無 node_modules）；建議 CI 或正式環境補一次安全測試回合。
