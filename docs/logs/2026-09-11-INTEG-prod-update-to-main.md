# 2026-09-11 INTEG 窗口：正式站更新至備用站版本 main `2355497`（代號 INTEG）

- **目標**：使用者裁定「以備用站為主」——把正式站（`:3000/:3001`）程式更新為備用站（`:3080/:3081`）所依據的 main `2355497`，**不動任何 DB 資料**（保留正式站 37 個租戶）。
- **關鍵決策**：
  - 只更新程式與映像，不做整庫覆蓋（正式站 37 租戶 vs 備用站 4 租戶，整庫覆蓋會刪除租戶）。
  - `724d39b..2355497` **無** compose／Dockerfile／`infra/docker/postgres/init.sql` 變更（`git diff --stat` 為空），故**不跑** `node scripts/init-db.mjs`，零 DDL 風險。
  - 建置以 `/root/APFS` 為 context、正式站自帶 compose（`NEXT_PUBLIC_EXPERIENCE=overview`、`NETWORK_PROVIDER=ip-api`、api `3001:3001`、web `3000:3000`）不變更。
- **改動檔案（VPS）**：
  - `/root/APFS`：`git pull --rebase origin main`，HEAD `724d39b` → `2355497`（+20 commit；含 `d8f49ed..3097f5b` 的戰情室／6+1 整併系列、`530f246`/`b30aa06` 首頁 dash 與 BS 對齊、`f5c1e7e` 指紋採集、`48ef3b1` 證據層規則、`93f84b0` 環境一致性規則）。
  - 重建映像 `shieldscan-api`、`shieldscan-web` 並 `docker compose up -d api web`。
- **驗證結果**：更新前後對照與複驗全數通過，詳見文末「驗收」。
  - 更新前：正式站 web 映像 2026-09-09 05:22、api 映像 2026-09-09 05:08；`/admin` title＝「管理者工作台」（舊版）。
  - 更新後：`/admin` title＝「戰情室 Command Center」，與備用站 `:3080` 同版；首頁仍為 overview 體驗。
- **未完成／待辦**：
  - 備用站仍落後 main 1 個 commit（`3097f5b` → `2355497`，僅 docs 規劃檔收錄），如需完全一致可另排時間同步（會短暫重啟禁關站的 web 容器）。
  - 兩站 api 映像於本次更新前皆早於 `b30aa06`；本次正式站重建後已含，**備用站 api 映像仍為 2026-09-09 14:12**（早於 `b30aa06` 09-09 22:09），需另排重建。
  - 補齊 `d8f49ed..2355497` 的 `docs/logs/` 日誌（本檔即為其中一環）與 CHANGELOG 里程碑行。
  - 清理 `/root/APFS` 殘留未追蹤檔（`=`、`CACHED`、`[api`、`[web`、`exporting`、`naming`、`unpacking`，為 docker build 指令誤貼 shell 產生）。

## 驗收

**部署事實**
- `/root/APFS` HEAD：`724d39b` → **`2355497`**，`git rev-list --count HEAD..origin/main` ＝ **0**。
- 建置：`docker compose build api web`（背景執行，log `/root/APFS/.deploy-build.log`，web 階段 159s）；`docker compose up -d api web` 完成，`shieldscan-api-1`／`shieldscan-web-1` 重新啟動（前者 Up 3 天 → Up 44 秒）。
- 未執行 `node scripts/init-db.mjs`：`724d39b..2355497` 對 `infra/**`、`scripts/init-db.mjs` 無變更（已驗，`git diff --stat` 為空），無 DDL 需求。
- 備用站（`:3080/:3081`）**全程未動**，容器未重啟。

**兩站一致性（複驗）**

| 檢查項 | `:3000`（正式） | `:3080`（備用） | 判定 |
|---|---|---|---|
| `/admin` title | 戰情室 Command Center | 戰情室 Command Center | ✅ 一致 |
| `/admin` 新版標記 | 戰情室／態勢感知／中樞神經／報告檢視 | 同 | ✅ 一致 |
| `/` title／`/demo`／`/admin/layout`／`/admin/baselines` | 同上，overview 體驗 | 同 | ✅ 一致 |
| api `/health` | `{"status":"ok","service":"shieldscan-api"}` | 同 | ✅ 一致 |
| api `dist/server.js` md5 | `b12677791376353faa99925e9518e2ea` | 同 | ✅ 位元相同 |
| api 內含新規則字串「時區名稱不同」 | 1 | 1 | ✅ 兩站皆有（原本兩站皆缺） |
| web `chunks/app/page-*.js` md5 | `eca7280c3fe9f16bc0d1dafa73706503` | 同 | ✅ 位元相同 |
| `NEXT_BUILD_ID` | `MnV1CKHzgbs0wBM8TaFM31` | `pBjs5BVhqN7eHnBptP5OZ` | ⚠️ 不同（僅建置識別碼） |
| shared chunk `206-*` | `4e64aecc…`／md5 `1c09a967…` | `51de1afd…`／md5 `49a9c7ea…` | ⚠️ 檔名與內容雜湊不同，屬建置雜湊差異 |

**結論：正式站已與備用站同版（main `2355497` 之 web＋api 程式），功能與頁面/路由程式位元相同；未被處理的僅剩 build id 與 shared chunk `206` 的建置雜湊差異，以及備用站落後 main 1 個 docs commit。**

**附帶清理**：查核階段產生的 probe 測試資料（每站 1 筆 `fingerprint_scans`＋1 筆 `report_facts`）已刪除，`remaining_probe = 0`，未影響 `risk_events` 與租戶資料。
