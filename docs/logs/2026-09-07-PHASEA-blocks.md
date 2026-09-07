# 技術日誌 — 2026-09-07 PHASEA blocks（窗口代號 PHASEA）

> 對應分支：`feat/phase-a-blocks`（已 rebase 至 origin/main `76880f3`）
> 協作規範：`AGENTS.md`

## 目標
- Phase A「版面設定（自訂區塊）」：把後台從固定頁面變成「每頁皆可拆區塊」，含後端持久化（tenant 隔離）與可視化管理；並將現有「管理者工作台 6+1」「公開首頁區塊管理」整合進版面設定，供試用站評判（評判 OK 後才由整合窗口合併／部署正式）。

## 關鍵決策
- **D1=safe**：區塊設定只存「純資料」（text/number/select/multiselect/toggle/color），不存 HTML／程式碼（沿用 code review 紅線）。
- 區塊＝「程式內定義（core-schema registry）＋租戶覆寫（dashboard_blocks 表）」兩層：registry 為單一事實來源，UI 依欄位定義自動生表單、API 以 zod strict 驗證。
- 公開首頁內容維持**全域（site_configs）**語意（與 open question #5 一致）：版面設定首頁內容頁整合原 HomepageConfig（10 區塊啟停/排序），hero/sections 文字設定並存。
- 工作台 6+1：registry 新增 `workbench` 頁與 7 張分類卡，並以 `WORKBENCH_MODULE_ID` 掛回原模組資料字典（`decision.verdict` 等 7 組：欄位＋API）。
- rebase 衝突以「保留雙方功能」解（見衝突清單），未覆蓋他窗口內容。

## 改動檔案（rebased commit 前綴）
| commit | 內容 |
|---|---|
| `df2c940` feat | M1：core-schema dashboard block registry（7 頁/22 區塊、zod strict、預設值、驗證）＋測試 |
| `de7dda6` feat | /admin/layout 版面設定 UI 雛形（registry 驅動、localStorage 試用）＋admin-nav 入口 |
| `80c436c` feat | M2+M3：init.sql dashboard_blocks 表、repository（PG＋in-memory）list/upsert/reset、API GET/PUT/reset、UI 接後端（無 key 降級 localStorage） |
| `a4e8290` feat | 工作台 6+1 頁＋即時資料卡（reports/risk-events/review-cases/audit-logs） |
| `7046b61` feat | 工作台區塊掛回原模組「資料欄位＋API」字典 |
| `65d277d` feat | 版面設定📣首頁內容整合公開首頁 10 區塊（HomepageConfig） |
| 本次 docs（PHASEA） | 本日誌＋CHANGELOG 里程碑行 |

## 驗證結果
- 本機：core-schema/repository/api/web typecheck 與 build 全綠；core-schema dashboard-blocks 測試、repository risk/repository 單元測試全綠（risk PG 段在無 DB 時 skip）。
- CI（重推後）：待確認 run 編號（見回報）；前幾輪同型變更皆全綠。
- 試用站（VPS `:3080/:3081`，獨立 DB）：版面 CRUD、audit、401/400、7 頁/22 區塊 API、公開首頁整合皆已實測通過；正式站（:3000/:3001）未受影響。

## 衝突清單（rebase origin main 76880f3）
1. `infra/docker/postgres/init.sql`：他窗口 WP3 `decision_outcomes` vs 本窗口 `dashboard_blocks` → 兩者皆保留（各自 CREATE TABLE IF NOT EXISTS＋索引）。
2. `packages/repository/test/risk.test.ts`：他窗口 outcomes 測試 vs 本窗口 dashboard blocks 測試（in-memory 與 PG 段）→ 皆保留，兩個獨立 test。

## 未完成／待辦
- 由整合窗口決定 merge 至 main 與正式站部署（本窗口不自行 merge）。
- 評判回饋後可能的調整：區塊欄位、即時卡內容、詳情頁（目標 B）是否納入、公開首頁 hero 是否也改由區塊驅動。
- 收尾選項：5432/6379 綁 127.0.0.1 硬化、驗收測試租戶清理、`feat/phase-a-blocks` 合併後刪除。
