# 2026-09-07 協調窗口：文件規範建立（代號 coord-docs）

- **目標**：為多組並行 agent 建立統一的「記錄／版本里程碑／技術日誌／審查報告」寫入規範與骨架。
- **關鍵決策**：
  - 規範放 repo 根目錄 `AGENTS.md`（並行 agent 啟動即自動讀取），統一各窗口寫入慣例。
  - 里程碑記錄：根目錄 `CHANGELOG.md`；細技術日誌：`docs/logs/YYYY-MM-DD-<代號>-<主題>.md`（每窗口一檔、檔名唯一）；審查報告：`docs/reviews/`。
  - Git 協作：push 前 `git pull --rebase origin main`、不 force-push main、不覆蓋他人日誌檔。
- **改動檔案**：`AGENTS.md`（新增）、`CHANGELOG.md`（新增）、`docs/logs/2026-09-07-coord-docs-bootstrap.md`（本檔）、`docs/reviews/`（前窗口已收錄兩份審查報告＋README）。
- **驗證**：本機 typecheck 不受影響（純文件）；推送後 GitHub main 更新、VPS `/root/APFS` 同步完成。
- **未完成/待辦**：
  - port 硬化（5432/6379 → 127.0.0.1）。
  - 公開站台 owner 邊界產品決策（舊 review_cases/audit_logs 各 8/12 筆 tenant_id=NULL）。
  - 併行開發（m1/m2、feat/phase-a-blocks 等）完成後的合併與追蹤對齊。
- **給其他並行 agent 的備註**：本機 `歸檔` clone 與多工作流共用；提交前務必 `git pull --rebase origin main`；若遇分支被重置/搬移，以 `origin/main` 為基準重新接枝。
