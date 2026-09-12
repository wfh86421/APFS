# Changelog

## 2026-09-13（INTEG）
- **流程 SOP 落地**：新增 `docs/PROCESS.md`——把 §1.5 製程寫成可執行 SOP（五步實際指令、部署後驗收清單、兩站一致性 md5 比對、回退表、常見坑），並補 §1.6「純營運／基礎設施改動」例外路徑（禁關站須先同意、變更前備份、**變更後等一個週期驗證**）。
- **修復備用站聚合 cron**：原本 crontab 只有正式站一條，備用站 `rule_baselines` 停在 09-08、`/v1/baselines` 賣過期資料；已追加 `*/10 * * * * docker exec -i shieldscan-trial-api-1 … aggregate-baselines.mjs`，實測 01:10 週期寫入 128 列、`max(updated_at)` 推進至 09-12 17:10 UTC，端點回傳新資料。備份 `/root/crontab-backup-20260913-010904`。
- **製程立規**：`AGENTS.md` 新增 §1.5「製程」——地基完成後，任何改動一律「本機寫 → **備用站 :3080/:3081 部署實測** → 測過才 commit/push GitHub → 累積到一階段才把正式站更新成備用站樣子 → 再推 GitHub」；明訂不得跳過備用站驗證直接推 main 或上正式站。
- **VPS 具備推送能力**：為 `/root/APFS` 與 `/root/shieldscan-trial-code` 裝上 GitHub 憑證（`/root/.git-credentials`，`chmod 600`＋`credential.helper=store`，帳號 `wfh86421`、scope `repo`），兩站自此可自行 `git push`；先前僅能 pull。兩站 checkout 同步至 `3f7a4d9`（0 behind）。

## 2026-09-11（INTEG）
- 兩站版本一致性查核：發現正式站（`/root/APFS` `724d39b`，落後 main 20 commit）與備用站（`3097f5b`，落後 1 commit）**並非同一版本**，且兩站 api 映像皆早於 `b30aa06`（缺 server 端「時區名稱不同即扣」規則）、備用站 web 映像內容早於同目錄程式 HEAD；已依使用者裁定「以備用站為主、只換程式不動資料」，將正式站更新至 main `2355497` 並重建 api/web 映像。複驗：兩站 `/admin` 同為「戰情室 Command Center」、api `dist/server.js` 與 web `chunks/app/page-*.js` **md5 位元相同**、`/health` 皆 ok；備用站全程未動。詳細數據見 `docs/logs/2026-09-11-INTEG-two-site-version-audit.md` 與 `docs/logs/2026-09-11-INTEG-prod-update-to-main.md`。
- 收錄 `d8f49ed..2355497` 里程碑（該批 8 個 commit 先前未入 CHANGELOG）：舊版 6+1／首頁工作台化整為零——採集設定→`/admin/collection`、首頁區塊→版面設定・首頁、移除 legacy-workbench；6+1 正名「報告檢視設定」；版面設定成為示範/報告頁版面單一來源（舊設定相容）；`/admin` 戰情室中樞＋⚙面板貼齊所點區塊。

## 2026-09-09（INTEG）
- W4「證據層規則點火」：`open_ports`（22/3389：`/v1/port-scan` 結果接線收案）與 `os_mismatch`（server 獨立判定 UA OS vs Client Hints）風險事件真正觸發並可於 `/v1/risk-events` 查得；`RULE_EVENT_TYPE` 補齊 4 個環境一致性 key（timezone_mismatch/language_mismatch/webrtc_ip_mismatch/canvas_disabled），修掉命中被誤標 `fingerprint_instability` 收容桶的系統性錯誤；webrtc 洩漏不再雙重扣分；對照表移入 scoring-engine 並以完整性測試把關（漏 key 即紅）。
- W1「指紋採集補齊」：browser-sdk 新增 `fonts`（保守測寬 hash＋detected list，含 CJK/程式字型）、`clientRects`（排版佈局 hash）、`mediaDevices`（enumerateDevices 僅狀態、不取流不詢問）三模組並註冊至首頁/掃描/登入風控三頁面；server `buildDeviceFingerprint` 補 `fontsHash`/`clientRectsHash` 寫入既有 `device_fingerprints` 欄位——補齊先前「DB 欄位已留、SDK 未採集」的護城河落差。

## 2026-09-08（INTEG）
- 新版首頁「掃描結果總覽」（BrowserScan 風格）完成試用站評判並**升版正式站**：進入即自動掃描（standard）、再次掃描用 ↻、頂部 📍IP＋複製＋重掃工具列、IP 下城市/國旗(flagcdn)、明暗模式(亮/暗/系統)、音效靜音、掃描進度可收合、`/admin/layout`「掃描總覽」8 區塊排序/停用即時生效；以 `NEXT_PUBLIC_EXPERIENCE=overview` 旗標啟用，classic 首頁路徑保留（未設旗標時不變，E2E 不受影響）。

## 2026-09-08（PHASEA）
- Phase A「版面設定（自訂區塊）」主線完成於 `feat/phase-a-blocks`（commit 前綴 df2c940..65d277d，rebase 於 main 76880f3）：M1 dashboard block registry（7 頁/22 區塊）、M2 `dashboard_blocks` 後端持久化、M3 版面 API（tenant 隔離＋audit）、M4 UI（/admin/layout）；並整合「工作台 6+1 即時卡＋原模組資料字典」與「公開首頁 10 區塊管理」。試用站（VPS :3080/:3081，獨立 DB）評判中；正式站部署由整合窗口接手。

## 2026-09-08（dsh）
- M2 設備關聯圖譜 v1 上線並部署（commit 360b60b）
- WP3 成效 ROI 管理頁上線（commit 966cd7c）
- M1「矛盾探測×成效閉環」合併 main（commit ee69a4e）
- CI 修復集＋租戶隔離正式部署（commit ab838c8）

> 版本與重大里程碑紀錄。格式：最新在上；里程碑級才新增。協作規則見 `AGENTS.md`、細目見 `docs/logs/`。

## Unreleased（2026-09-07）

### 安全與治理里程碑（本窗口：3f9df1f..ba315c9）
- P1/P2 增量修復 `3f9df1f`：API Key 撤銷/輪換/清單＋審計軌跡、CSP/安全 headers（api＋web）、`/v1/devices` 寫入接線（device_fingerprints/network_signals）、expires_at 清理（server 排程＋`scripts/cleanup-expired.mjs`）、決策表統一（core-schema `policyDecisionForRiskLevel`）。
- CI 全綠修復三連 `c77ce03`/`0898850`/`ab838c8`：PG 整合測試 tenant 改合法 UUID；`init.sql` site_configs 語法損毀修復（全新 DB 套 schema 不再失敗）；CSP `connect-src` fallback 對齊 api.ts。→ CI #48/#49 與 Verify Prod Storage #21 全綠。
- 文件收錄 `ba315c9`：審查報告進入 `docs/reviews/`（含 README 索引）。

### 併行開發窗口（main 持續推進，自 ab838c8 起）
- m1-wp1 規則引擎活化 `14fc4e4`：伺服器事實進規則、證據鏈規則對齊。
- m1-wp2 IP 速度規則 `8180860`：fingerprint_hash 掛載＋同裝置多 IP 偵測。
- m1-wp3 決策成效閉環 `b931897`：decision_outcomes、POST /v1/outcomes、GET /v1/roi、shadow decision_log。
- m1-wp4 header 一致性 `ee69a4e`：伺服器獨立判定 UA/Client-Hints 矛盾。
- WP3 ROI 視覺頁 `966cd7c`（`/admin/roi`）。
- m2 裝置關聯圖譜 `362b2c6`＋m2-admin 視圖 `360b60b`：sessions/IP/帳號/同 IP 裝置查詢與 API。

### 部署與驗收（2026-09-07）
- 正式庫 schema 遷移完成：`review_cases`/`audit_logs` 補 `tenant_id`（UUID）＋`idx_review_tenant`/`idx_audit_tenant`；新版 init.sql 全量冪等同步（11 個 tenant 欄位／8 個索引）。
- VPS 部署 `ab838c8` 版本並通過實測驗收（key 清單/撤銷/輪換/審計、安全 headers、頁面 200）。

## 待辦/開放
- 公開站台（tenant_id=NULL）與租戶資料的 owner 邊界決策（舊 review_cases/audit_logs 8/12 筆為 NULL）。
- 增量審查其餘 Medium：XFF 信任、限流 429、audit 身分欄、webhook SSRF 面。
