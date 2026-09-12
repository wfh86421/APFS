# AGENT-ONBOARD — 新窗口「開機指令包」

> 給任何新開的並行 agent 窗口。用法：開新窗口 → 貼下方「開機指令包」整段（或貼「讀本檔並執行」一句話）。
> 協作總綱見根目錄 `AGENTS.md`；分派/代號表見 `docs/AGENT-DISPATCH.md`。

## 🪟 開機指令包（複製整段）

```
開工前請依序執行，不要跳過：
1) 讀 repo 根目錄 AGENTS.md（協作規範：記錄位置/每窗口日誌/git 規約/部署/備用站禁令），
   並讀 docs/AGENT-DISPATCH.md（分派範本與代號表）。
2) 載入 rtk 技能並遵守：任何輸出可能很大的指令（git log/diff/status、讀大檔、
   grep/rg、測試、docker ps 等）一律用 rtk 包裝；Windows 下 ls/tree/find 不包裝；
   rtk 無法解析的工具退回原指令，不得因包裝失敗影響工作。
3) 先做「身分回報」（只回報、不改檔）：
   代號（若有指定用指定，否則自取）／目前 checkout 分支／最近自己 push 的 commit 前 7 碼。
4) 只動「本次任務」相關檔案：不得改其他窗口的 docs/logs 日誌檔、不得 force-push main、
   不得關閉/刪除並行試用站（備用站，見 AGENTS.md）。
5) 程式/流程規範：
   - 本機驗證：pnpm -r typecheck && pnpm -r build；單測 pnpm test；
     碰 schema/SQL/測試 tenant 值 → 「本機綠 ≠ CI 綠」，等 CI（Apply schema/test:postgres）驗證。
   - 推送前一律 git pull --rebase origin main；衝突保留雙方內容。
   - 大功能先開分支（feat|fix|docs|chore/<主題>）跑 CI 全綠後，交整合窗口合併 main，勿自行直推 main。
6) 完工前（依 AGENTS.md §2）：
   - docs/logs/YYYY-MM-DD-<代號>-<主題>.md 寫窗口日誌（目標→決策→改動檔案→驗證→待辦）；
   - 里程碑級更新根目錄 CHANGELOG.md；commit 訊息帶（<代號>）。
7) 完工回報格式（貼回給整合/使用者）：
   代號／分支／commit 前 7 碼／做了什麼／驗證結果（本機+CI run 編號）／待辦與給其他窗口的備註。
```

## ➕ 角色補充指令

- **一般實作窗口**：以上開機包即完整；把「本次任務」附加在開機包之後。
- **只讀審查/QA 窗口**：追加「本窗口只讀驗證、不改產品程式；發現/結論寫入 docs/reviews/YYYY-MM-DD-<代號>-<主題>.md」。
- **整合窗口（合併/部署）**：依 `docs/AGENT-DISPATCH.md` §6 檢查清單：分支已 pull --rebase → typecheck/build → 相關測試 → CI 全綠 → 合入 main → 需要時部署（先試用站驗證）→ 更新 CHANGELOG/代號表 → 回報 commit 與部署狀態。

## ⛔ 鐵律速記
- **對話只給摘要（AGENTS.md §0）**：不在對話貼整份報告／長清單／大段原始輸出；完整內容寫檔，對話留 3–6 行摘要＋路徑；大輸出先在指令端用 `grep`／`wc -l`／`head` 過濾。使用者明確要求全文時才貼。
- **製程（AGENTS.md §1.5，預設工作流）**：本機 `_v3` 寫 → **先在備用站 :3080/:3081 部署實測** → 測過才 commit/push GitHub → 累積到一階段才把正式站更新成備用站樣子 → 再推 GitHub。**不得跳過備用站驗證**。
- 不 force-push main；push 前 `git pull --rebase origin main`。
- 不覆寫他人 docs/logs 檔；commit 帶自己代號。
- **試用站＝備用站，未經明確指示不得關閉/刪除/重設**（見 AGENTS.md §5）。
- 本機綠 ≠ CI 綠；碰 DB/schema 以真實 Postgres（CI）驗證；tenant_id 一律 UUID。
