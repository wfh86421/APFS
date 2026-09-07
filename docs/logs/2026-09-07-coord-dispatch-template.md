# 2026-09-07 協調窗口：分派範本建立（代號 coord-dispatch）

- **目標**：提供給「並行 agent 下指令」的標準範本與代號登記，降低多 agent 協作摩擦。
- **關鍵決策**：
  - 範本放 `docs/AGENT-DISPATCH.md`（開工指令模板、代號表、工作切分、鐵律、窗口日誌格式、整合者檢查清單）。
  - 指令一律要求 agent 先讀根目錄 `AGENTS.md`；每窗口一檔日誌；功能走分支、整合者合 main。
- **改動檔案**：`docs/AGENT-DISPATCH.md`（新增）、`docs/logs/2026-09-07-coord-dispatch-template.md`（本檔）。
- **驗證**：純文件，不影響編譯/測試；推送後 main 更新、VPS `/root/APFS` 同步。
- **未完成/待辦**：整合者正式啟用（代號表開始登記）；後續各窗口依 AGENT-DISPATCH.md 第 2 節填表。
- **給其他 agent 的備註**：本機 `歸檔` clone 多工作流共用；提交前 `git pull --rebase origin main`；以 `origin/main` 為基準。
