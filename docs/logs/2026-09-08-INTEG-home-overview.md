# 2026-09-08 INTEG 窗口：新版首頁掃描總覽（BrowserScan 風格）

- **目標**：試用站首頁大改版——進入即自動掃描、再次掃描需點擊、報告含「頁面＋IP」並以 BrowserScan 總覽版型呈現。
- **關鍵決策**：
  - 以 build-time 旗標 `NEXT_PUBLIC_EXPERIENCE=overview` 切換新版（page.tsx 頂部 early-return）；未設旗標＝classic 首頁，正式站與 E2E（local-only、點開始掃描）完全不受影響。
  - 新版固定 `standard` 模式自動掃描一次（需伺服器回傳 IP/地理/ISP/WebRTC 比對與分數）；module 層級旗標防 StrictMode 雙跑。
  - 版型：深色快速摘要 hero（頁面/瀏覽器/IP/時區/地理/語言/ISP/代理/匿名/DNS/機器人 等 14 列）＋「網站會看到你哪些資訊」2~4 欄資訊卡片（IP/地理/硬體/瀏覽器/網路/異常/評分）。
- **改動檔案（commit 待補）**：
  - `apps/web-scanner/src/components/home-overview-v2.tsx`（新增，約 936 行）
  - `apps/web-scanner/src/app/page.tsx`（僅加 import＋頂部 early-return）
  - `apps/web-scanner/src/app/globals.css`（追加 `ov-*` 樣式）
  - `docs/logs/2026-09-08-INTEG-home-overview.md`（本檔）、`CHANGELOG.md`（里程碑行）
- **驗證**：subagent 以臨時 tsconfig（對映 pnpm store）`tsc --noEmit` EXIT=0；正式以分支 CI（Build/Typecheck）複核；classic E2E 不受影響。
- **未完成/待辦**：
  - 黑名單/機器人偵測、7 天 IP 計數、字型/外掛為推估或 `—`（SDK/API 暫無對應欄位）。
  - 試用站部署（`shieldscan-trial-code` 切本分支＋compose 注入 `NEXT_PUBLIC_EXPERIENCE=overview`）待執行。
  - 使用者在 :3080 評判後再決定合併 main／正式站。
