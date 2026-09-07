# 窗口日誌 — REVIEW（P1 第二波現況抽查）2026-09-07

> 代號：REVIEW　窗口：現況抽查窗口　基準：origin/main `9695432`

## 目標
承 P0 抽查（76880f3，已併入 main），以最新 main `9695432` 複查增量複審報告 §2 的 P1 清單與相關 P2：證據鏈自動事件化、規則引擎斷鏈、policy-engine、簽章信任模型、site_configs 全域、admin key localStorage、deleteVisitor GDPR 級聯、expires_at 清理、六層資料層、詳情頁 fraudScore 鏡像、STUN。只讀驗證，不改產品程式碼。

## 關鍵決策
- 續用獨立 worktree `review-spotcheck`；先 `git fetch + pull --rebase origin main`（前次 docs commit e3b0ca3 已被 coord 併入 main，遠端 review/spotcheck-main 已刪，本分支與 main 同步）。
- 以「唯讀逐行核對＋grep 交叉」判定 PASS/FAIL/部分；fresh worktree 無 node_modules，未重跑單測。
- 文件依 AGENTS.md：報告 docs/reviews/、日誌 docs/logs/（檔名唯一 `2026-09-07-REVIEW-p1-spotcheck.md`）、同步 validation-tracker。

## 改動檔案（commit 前綴 docs（REVIEW））
- `docs/reviews/2026-09-07-current-head-p1-spotcheck.md`（新增）— P1×10＋P2×3 判定表（含行號）
- `docs/validation-tracker.md` — B「高風險事件有證據鏈」列更新＋G 補記第二波
- `docs/logs/2026-09-07-REVIEW-p1-spotcheck.md`（新增，本檔）

## 驗證結果（基準 9695432）
- ✅ PASS：①自動 RiskEvent＋review case 回填（server.ts:504-536,1358-1376）②伺服器事實規則接線（scoring-engine:216-273）⑧expires_at 清理（postgres.ts:303-308；server.ts:1772-1792）⑩⑪P0 未回退
- 🟡 部分：⑤site_configs 權限收斂仍全域列
- ❌ FAIL：③policy-engine 零引用 ④簽章全域 secret/未設即停/canonical 7 欄 ⑥admin key localStorage＋無守衛 ⑦deleteVisitor 未級聯 risk/devices ⑨六層缺 5 表 ⑫詳情頁 fraudScore 鏡像 ⑬local-only STUN

## 未完成／待辦
- FAIL 項目多與 security/tenant-isolation-r1 窗口及後續 phase 職權重疊 → 建議 coord 分派，避免 REVIEW 重複開修。
- 本 worktree 未跑單測/curl；建議 CI/正式環境補安全測試回合。
