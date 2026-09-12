# ShieldScan / APFS 專案總覽（現況快照）

> 產生時間：2026-09-13（INTEG 窗口）。所有數據為當下實測，非引用舊文件。
> 角色：繼續當「整合窗口 INTEG」，依 `AGENTS.md`（含新增 §1.5 製程）運作。

## 1. 一句話現況

地基與主要功能已完成並上線；**兩站程式已同版**（main `c427bf0`），製程規範與 VPS 推送憑證剛建立完成。下一個工作階段應以「先備用站實測」的新製程推進未完成項目。

## 2. 版本與站台狀態

| 項目 | 值 |
|---|---|
| GitHub `wfh86421/APFS` main | **`c427bf0`** |
| 本機 `_v3`（唯一工作 checkout） | `c427bf0`，乾淨、0 behind |
| 正式站 `/root/APFS` | `c427bf0`，0 behind |
| 備用站 `/root/shieldscan-trial-code` | `c427bf0`，0 behind |

| 站 | 前端 | API | web 映像建置 | api 映像建置 | 容器狀態 |
|---|---|---|---|---|---|
| 正式站 | `:3000` → 200 | `:3001/health` → ok | 2026-09-13 00:30 | 2026-09-13 00:28 | web/api Up（09-13 00:31 重啟） |
| 備用站（禁關） | `:3080` → 200 | `:3081/health` → ok | 2026-09-10 02:16 | 2026-09-09 22:12 | web Up 4 天 / api Up 4 天 |

- 兩站 `/admin` 皆為「戰情室 Command Center」；api `dist/server.js` 與 web `chunks/app/page-*.js` **md5 位元相同**。
- 唯一非位元相同：`NEXT_BUILD_ID` 與 shared chunk `206` 的建置雜湊（不影響功能）。
- 兩站 DB 皆 Healthy，postgres 正式站綁 `127.0.0.1`；VPS 根分割區 39G 用 27G（73%）。

## 3. 製程（AGENTS.md §1.5，2026-09-13 新立）

```
① 本機 _v3 寫改動
② 先在備用站 :3080/:3081 部署 + 實測      ← 不得跳過
③ 測過才 commit + push GitHub
④ 累積到一個階段 → 正式站 :3000/:3001 更新成備用站樣子
⑤ 再從主站推 GitHub 確認同步
```

- 禁制：不得跳過②直接推 main 或上正式站。
- VPS 已具備推送能力：`/root/.git-credentials`（600、`credential.helper=store`、帳號 `wfh86421`）；實測從 VPS 推 GitHub 成功。

## 4. 兩站資料（各自獨立 DB）

| 資料表 | 正式站 | 備用站 | 備註 |
|---|---|---|---|
| `tenants` | **37** | 4 | 正式站租戶多；**不得整庫覆蓋** |
| `report_facts` | 19 | 198 | 備用站為測試累積 |
| `rule_baselines` | 11 | 44 | 正式站每 10 分鐘更新；**備用站停 09-08** |
| `risk_events` | 28 | **572** | 正式站最後一筆 09-08 21:28 UTC；備用站 09-12 17:02 UTC（測試流量持續觸發） |
| `dashboard_blocks` | **0** | 8 | 正式站尚無版面設定資料 |
| `fingerprint_scans` | 67 | 357 | 正式站最後一筆 09-11 23:12 UTC |

## 5. 待辦與風險（依優先序）

### P1 — 需你決定
1. **備用站聚合 cron 缺失**：crontab 只有一條 `*/10 * * * * docker exec -i shieldscan-api-1 … aggregate-baselines.mjs`（只跑正式站容器、只寫正式庫）。備用站 `rule_baselines` 停在 **2026-09-08 21:10**，等於 `/v1/baselines` 在備用站賣的是 5 天前的資料。→ 需補一條指向 `shieldscan-trial-api-1` 的 cron。
2. **GitHub 暫存 repo 待刪**：`wfh86421/zz-待刪除-INTEG-暫存`（private，09-13 推送能力測試殘留）。token 無 `delete_repo` scope，需你在網頁刪除。

### P2 — 功能缺口
3. **正式站風險規則近 4 天零觸發**：`risk_events` 最後一筆 09-08 21:28，但 09-09～09-11 仍有真實掃描（匿名、台灣 IP）。需查是「真的沒觸發」還是「寫入鏈路斷了」。
4. **兩站 web 映像仍是舊建置的備用站**：功能同版，但若要「完全一致」需重建備用站 web（會短暫重啟禁關站，需你同意）；備用站 api 映像亦早於本次正式站重建。
5. **DNS 國家一致性扣分**（需外部 DNS 解析）、**DNT 提示**：備忘錄列為後續。
6. **基準分布與評分串接**（罕見度計價）：備忘錄標示的「下一大步」。

### P3 — 清理與治理
7. `/root/APFS` 殘留未追蹤檔（`=`、`CACHED`、`[api`、`[web`、`exporting`、`naming`、`unpacking`）——docker build 指令誤貼 shell 產生。
8. 根目錄 `C:\Users\User\Documents\APFS` 有三個 checkout（`_v3` 現役、`_v2`、`歸檔` 皆已含於 main）＋散檔（`_poll*.sh`、`_dom3080.html`、`_fig1.*`、`_review-head.zip`、兩份複審報告）。你裁定「先不動，只保留 `_v3` 為工作區」。
9. `docs/logs/` 缺 09-10 那批 Phase2 重構的第一手窗口日誌（已在 CHANGELOG 補里程碑敘述，但無原始日誌可代寫）。
10. `CHANGELOG.md`「待辦/開放」舊項：公開站台（tenant NULL）owner 邊界決策；增量審查其餘 Medium（XFF 信任、限流 429、audit 身分欄、webhook SSRF 面）。

## 6. 常用操作（VPS 107.174.241.48，SSH 5522）

```bash
# 備用站部署（製程步驟②）
ssh -p 5522 root@107.174.241.48 \
  'cd /root/shieldscan-trial-code && git pull --ff-only origin main && \
   cd /root/shieldscan-trial && docker compose up -d --build web api'

# 正式站更新（製程步驟④）
ssh -p 5522 root@107.174.241.48 \
  'cd /root/APFS && git pull --ff-only origin main && docker compose up -d --build api web'
```

- 兩站皆以 `docker compose up -d --build` 重建；**備用站重建前需使用者同意**（禁關站）。
- 大量輸出指令以 rtk 包裝（見 `docs/AGENT-ONBOARD.md`）。
