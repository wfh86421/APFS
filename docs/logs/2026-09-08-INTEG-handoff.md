# 2026-09-08 INTEG 交接備忘錄（換新會話請先讀本檔＋AGENTS.md＋docs/AGENT-ONBOARD.md）

- **Repo**：`wfh86421/APFS`（本機 `歸檔`/`_v3` worktree；GitHub main＝`724d39b`）。
- **你的角色**：繼續當「整合窗口 INTEG」，依 AGENTS.md 記錄/推送規約運作；push 前 `git pull --rebase origin main`。

## 兩站現況（VPS 107.174.241.48；root SSH 埠 5522，密碼見先前對話，勿寫入 git）
| 站 | URL | 內容 | 狀態 |
|---|---|---|---|
| 正式站 | http://107.174.241.48:3000/（api :3001） | 最新 main 724d39b：掃描總覽(overview 旗標已固化)、企業級進度台、環境一致性扣分、基準分布 | ✅ 與備用同功能 |
| 備用站(禁止關閉) | http://107.174.241.48:3080/（api :3081） | 同上（程式 /root/shieldscan-trial-code；compose /root/shieldscan-trial，build 旗標 overview） | ✅ 保留 |

兩站 DB 已含 `report_facts/rule_baselines`；聚合 cron 每 10 分鐘（正式+trial 各一）。postgres/redis 已綁 127.0.0.1。

## 已完成（近期 main）
- 新版首頁「掃描總覽」：進頁自動掃描(standard)、↻重掃、📍IP＋複製＋重掃、IP 下城市/旗(flagcdn)、明暗(亮/暗/系統)、企業級動態進度台（[日誌固定寬|進度條|%等寬]、5 階段終端文字、fake-ease）。
- 評分新規則（收案伺服器判定）：timezone_mismatch -8、language_mismatch -6、webrtc_ip_mismatch -8、canvas_disabled -5（＋既有 proxy/dc/vpn/tor/dns/velocity/header）。目的：縮小與 whoer.net/browserscan 落差。
- 基準分布（數位黃金 Step2）：`report_facts`(收案寫入)＋`rule_baselines`(聚合)＋`scripts/aggregate-baselines.mjs`＋`GET /v1/baselines`＋admin 頁 `/admin/baselines`。
- 文件：AGENTS.md（含試用站=備用站禁關）、CHANGELOG、docs/AGENT-DISPATCH.md、docs/AGENT-ONBOARD.md、docs/logs/*。

## 進行中／待辦
- 驗收正式站＝備用站版本（使用者最後在確認正式站已回 overview）。
- DNS 國家一致性扣分（需外部 DNS 解析，暫列後續）；DNT 提示。
- 基準分布與評分串接（「此規則在此 country/asn/tz 的罕見度」計價）＝下一大步。
- 併行其他 agent 窗口：依 AGENTS.md 協作；本機 `歸檔` clone 為共享 checkout（注意競態，用獨立 worktree 合併）。

## 常用指令
- 本機合 main 用獨立 worktree：`git -C 歸檔 worktree add --detach <wt> origin/main` → merge → push HEAD:main → remove。
- VPS 更新：plink（-P 5522）執行 `/root/APFS` 或 `/root/shieldscan-trial-code` git pull ＋ `docker compose build/up -d`。
- 大量輸出指令一律 rtk 包裝（見 AGENT-ONBOARD）。

*本檔由 INTEG 產生，供新會話接手；後續新進度請另寫 docs/logs 當日檔。*
