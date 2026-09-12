# 2026-09-13 INTEG 窗口：制定可執行流程 SOP ＋ 修復備用站聚合 cron（代號 INTEG）

- **目標**：把使用者裁定的「備用站先行」製程，從 `AGENTS.md` §1.5 的原則，落成**照著做就能跑**的 SOP；並依使用者指示「下一步 制定流程執行」，用該流程實跑第一項待辦（P1-1 備用站聚合 cron 缺失）。
- **關鍵決策**：
  - SOP 寫成獨立檔 `docs/PROCESS.md`（AGENTS.md §1.5 保持原則、指向 SOP），內容含：五步流程實際指令、部署後驗收清單、兩站一致性比對（md5）、回退表、常見坑。
  - 新增 §1.6「例外路徑：純營運改動」——不動 repo 程式的 VPS 層改動（cron／env／compose）不走④⑤，但**禁關站須先經同意、變更前備份、變更後等一個週期驗證**。本次 cron 修復即屬此類。
  - 修復方式：只在 VPS crontab 追加一條指向 `shieldscan-trial-api-1` 的聚合指令（**不改任何程式碼**），與正式站既有條目同型、分開寫 log 檔。
- **改動檔案**：
  - `docs/PROCESS.md`（新增，commit `f6b7de1` 前綴 docs（INTEG））
  - `AGENTS.md`（§1.5 補「可執行 SOP 指向」）
  - `docs/overview-current-state.md`（P1-1 標記為已修復）
  - `docs/logs/2026-09-11-INTEG-two-site-version-audit.md`（待辦項勾銷）
  - VPS（非 repo）：`/var/spool/cron/crontabs/root` 追加一行；備份於 `/root/crontab-backup-20260913-010904`（變更前狀態）
- **執行內容（cron）**：

```
*/10 * * * * PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin docker exec -i shieldscan-trial-api-1 sh -c "node /app/scripts/aggregate-baselines.mjs" >/tmp/fm-agg-trial.log 2>&1
```

- **驗證結果**：
  - 機制驗證（手動跑）：`[aggregate-baselines] facts=199 dim-totals=35 baseline-rows=128`，trial `rule_baselines` 由 44 列（停 09-08）更新為 128 列，無重複列（unique `(rule_id,dim,dim_value)`，upsert 冪等）。
  - **排程驗證（等一個週期）**：01:10 週期自動執行，`/tmp/fm-agg-trial.log` 產生（64 bytes，`facts=199 … baseline-rows=128`），DB `max(updated_at)` ＝ `2026-09-12 17:10:02Z`（前值 09-08）。
  - 端點驗證：`http://107.174.241.48:3081/v1/baselines` → HTTP 200，`rows[].updatedAt` ＝ `2026-09-12T17:10:02.317Z`（不再賣 09-08 的過期資料）。
  - 正式站未受影響：cron 原條目保留、`/tmp/fm-agg.log` 照常。
- **未完成／待辦**：
  - P1-2「正式站風險規則近 4 天零觸發」尚未查（需比對 `risk_events` 寫入鏈路 vs 真實掃描）。
  - 備用站 web／api 映像仍為舊建置（非本次範圍；如需完全一致須重建，動禁關站需使用者同意）。
  - `wfh86421/zz-待刪除-INTEG-暫存` 待使用者於網頁刪除。

## 本次流程自評（依 docs/PROCESS.md）

| 步驟 | 本次執行 |
|---|---|
| ① 本機寫改動 | `_v3` 寫 `PROCESS.md`、`AGENTS.md`、記錄檔 |
| ② 備用站部署實測 | 本項為營運改動，依 §1.6：先手動驗證機制 → 備份 crontab → 加入 → **等一週期**驗證 log／DB／端點 |
| ③ 推 GitHub | `f6b7de1`（本機 → origin/main） |
| ④ 正式站更新 | 不需（未改程式、未改映像）；僅確認 `/root/APFS` 不落後 main |
| ⑤ 從主站確認同步 | 兩站 checkout 同步至 `f6b7de1`，`behind=0` |
