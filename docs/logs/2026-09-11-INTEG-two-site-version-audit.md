# 2026-09-11 INTEG 窗口：兩站版本一致性查核（代號 INTEG）

- **目標**：接手交接備忘錄「進行中／待辦」第 1 項——驗收「正式站＝備用站版本」。查核階段僅讀取、不動任何站台程式、不重啟容器、不改 DB 資料。
- **後續處置**：查核結果為「不通過」後，使用者裁定「以備用站為主、只換程式不動資料」，正式站已於同日更新至 main `2355497`，複驗通過——詳見 `docs/logs/2026-09-11-INTEG-prod-update-to-main.md`。
- **基準**：main = `2355497`（本機 `_v3`，`git pull --rebase origin main` → Already up to date）。
- **查核方式**：VPS（107.174.241.48:5522）`git log`＋`docker images/inspect`；兩站 HTTP 實測（頁面 title、admin 頁內容標記、api 端點）；not 以備註文件的敘述為準。

## 結論：**不通過**——兩站不是同一版本，且各自都落後 main

| 站 | 部署目錄 | 程式 HEAD | 落後 main | 執行中 web 映像建置時間 | 執行中 api 映像建置時間 | 實測特徵 |
|---|---|---|---|---|---|---|
| 正式 :3000/:3001 | `/root/APFS` | **724d39b**（09-09） | **20 個 commit** | 2026-09-09 05:22 | 2026-09-09 05:08 | `/admin` title＝「管理者工作台」（舊版） |
| 備用 :3080/:3081（禁關） | `/root/shieldscan-trial-code` | **3097f5b**（09-10 02:12） | 1 個 commit | 2026-09-10 02:16 | 2026-09-09 14:12 | `/admin` title＝「戰情室 Command Center」（新版，含「態勢感知／中樞神經」） |

即**備用站程式比正式站新約 6 個 commit**（備用站已含 09-09 晚間～09-10 凌晨的 6+1／工作台整併系列 `ee49b9a..3097f5b`），與交接備忘錄「兩站同功能 ✅」的敘述不符。

## 證據

1. **部署程式 HEAD**（VPS `git log -1 --oneline`）
   - `/root/APFS` → `724d39b fix(infra)（INTEG）: 正式站 compose 固化 NEXT_PUBLIC_EXPERIENCE=overview`
   - `/root/shieldscan-trial-code` → `3097f5b fix（INTEG）: 戰情室底註去重複入口名稱`
   - 落後量（`git rev-list --count HEAD..origin/main`）：`20` / `1`。
2. **執行中映像 ≠ 程式 HEAD**（`docker images` / `docker inspect`）
   - `shieldscan-web`（正式）建置於 09-09 05:22 ← 對應 `724d39b`（09-09 05:19 合併），一致。
   - `shieldscan-trial-web` 建置於 09-10 02:16，晚於 `3097f5b`（02:12）；但 `/admin` 內容標記顯示其執行的是 `ee49b9a`（09-09 23:47）之後、`d8f49ed`（09-10 00:00）之前的版本 → **建置時間與實際內容不一致，映像內容早於同目錄程式 HEAD**。
   - `shieldscan-api`（正式）09-09 05:08、`shieldscan-trial-api` 09-09 14:12：**兩者皆早於 `b30aa06`（09-09 22:09）**，即兩站 api 皆缺該 commit 的 server 端規則（時區「名稱不同即扣」）。
3. **頁面實測**（同一路徑、同一時間）
   - `/admin`：`:3000` title＝「ShieldScan 管理者工作台」；`:3080` title＝「ShieldScan 戰情室 Command Center」。
   - `/admin` HTML 標記：`:3080` 含「戰情室 Command Center／中樞神經／態勢感知／報告檢視」；`:3000` 全無。
   - 首頁（`/`）：兩站 HTML 文字完全相同（`NEXT_PUBLIC_EXPERIENCE=overview` 一致），但 SSR 引用的 chunk 檔名不同（`:3000` 有 `412-*`、無 `1-*`；`:3080` 有 `1-*`、`206-*` hash 亦不同）→ 兩份不同建置產物。
4. **api 端點對照**（未帶 key 探測）：`/v1/baselines` 兩站皆 200；`/v1/dashboard/blocks`、`/v1/risk-events` 兩站皆 401（存在、需授權）；`/v1/blocks`、`/v1/report-view` 皆 404。→ 兩站 api 表面一致，差異僅在 `b30aa06` 之後的規則內容（見證據 2）。
5. **容器狀態**（未觸碰）：`shieldscan-web-1` Up 3 天、`shieldscan-api-1` Up 3 天、`shieldscan-trial-web-1` Up 2 天、`shieldscan-trial-api-1` Up 3 天；postgres/redis 皆 127.0.0.1 綁定（正式）與內網（trial），備用站堆疊完整保留。

## 查核過程附帶發現

- `/root/APFS` 工作目錄有殘留未追蹤檔：`= CACHED [api [api] [web` 等（疑為 docker build 指令被誤貼進 shell 產生），程式碼本身乾淨（`git status` 無 modified）。
- 交接備忘錄寫「GitHub main＝724d39b」已過期；main 於 09-10 又推進 8 個 commit（`d8f49ed..2355497`，全為 INTEG 的 Phase2 版面／戰情室整併）。
- **文件缺口**：`d8f49ed..2355497` 這批 09-10 commit **沒有** `docs/logs/` 窗口日誌，也**沒有**更新 `CHANGELOG.md`（`git log --since=2026-09-10 -- CHANGELOG.md` 為空），不符 AGENTS.md §2。
- 查核時對兩站各送出 1 筆匿名時區探測報告（`sdk.name='probe'`、`sdkVersion='0.0.1'`、`source='web'`、`consent=standard`、`reportId` 與 `sessionId` 為當次產生的 UUID、`pluginId='probe'`）作為 api 版本行為探針；因匿名 tenant_id=NULL 屬公共資料，未觸發可判讀的時區差異（兩站皆無 `timezone_mismatch`），故 api 版本結論改以映像建置時間與 bundle 內容為準。**該 2 筆測試資料已於查核後刪除**（每站 `report_facts` 1 筆＋`fingerprint_scans` 1 筆，確認 `remaining_probe=0`；兩站皆無對應 `risk_events`）。

## 未完成／待辦

- [x] 決定版本收斂方向：使用者裁定 **A（以備用站程式為主）**——正式站更新至 main `2355497`，不動 DB 資料。
- [ ] 補齊 `d8f49ed..2355497` 的 `docs/logs/` 日誌與 CHANGELOG 里程碑行。
- [ ] 清理 `/root/APFS` 殘留未追蹤檔（`=`、`CACHED`、`[api`、`[web`、`exporting`、`naming`、`unpacking`）。
- [x] 兩站 api 映像皆需含 `b30aa06` 起之 server 端規則——複驗時兩站 `server.js` md5 相同（`b1267779…`）且含新規則字串。
- [ ] 備用站為禁關站：任何 `docker compose up -d --build` 會短暫重啟其容器，需使用者明確同意後才可執行。

## 查核後複驗（正式站更新至 `2355497` 後）

| 檢查項 | 結果 |
|---|---|
| 頁面 title `/admin` | `:3000`＝`:3080`＝「ShieldScan 戰情室 Command Center」✅ |
| `/admin` 新版標記 | 兩站皆含「戰情室 Command Center／態勢感知／中樞神經／報告檢視」✅ |
| 首頁 | 兩站同為 overview 體驗（`NEXT_PUBLIC_EXPERIENCE=overview` 未變）✅ |
| api `/health` | `:3001`／`:3081` 皆 `{"status":"ok","service":"shieldscan-api"}` ✅ |
| api 程式 | 兩站 `/app/apps/api/dist/server.js` md5 相同＝`b12677791376353faa99925e9518e2ea`，且皆含 `時區名稱不同` 新規則 ✅ |
| web 頁面程式 | 兩站 `chunks/app/page-*.js` md5 相同＝`eca7280c3fe9f16bc0d1dafa73706503` ✅ |
| `NEXT_BUILD_ID` | `:3000`＝`MnV1CKHzgbs0wBM8TaFM31`、`:3080`＝`pBjs5BVhqN7eHnBptP5OZ`（僅建置識別碼不同） |
| 唯一非位元相同項 | 共用 chunk `206-*`：`:3000`＝`4e64aecc…`（1c09a967…）、`:3080`＝`51de1afd…`（49a9c7ea…）；屬 Next.js 內容雜湊差異，頁面/路由程式相同 |

**最終判定：功能版本一致（通過），非位元級相同（build id、shared chunk 206 不同）。**
