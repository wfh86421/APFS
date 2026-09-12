# PROCESS — 改動執行流程（可照著跑的 SOP）

> 本檔是 `AGENTS.md` §1.5「製程」的可執行版本。每個窗口動工前讀一次、完工前照 §4 驗收。
> 適用範圍：**地基（結構／版面）完成後**的所有功能、修補、設定改動。
> 代號：本窗口延用 **INTEG**；執行者＝當前窗口的 agent。

## 0. 為什麼要這樣跑

| 站 | 角色 | 誰可以動 | 何時動 |
|---|---|---|---|
| 備用站 `:3080/:3081`（試用站，**禁關**） | **測試場** | 全部改動先在這裡 | 每次改動的第一站 |
| 正式站 `:3000/:3001` | 對外服務 | 只放「已在備用站驗證過」的版本 | 累積到一個階段後 |
| GitHub `wfh86421/APFS` | 定案紀錄 | 測過才推 | 步驟③、⑤ |

**紅線**：不得跳過步驟②。**「本機綠 ≠ 備用站綠 ≠ CI 綠」**；未在備用站實測過的改動，不得推 main、不得上正式站。

## 1. 五步流程（含實際指令）

### ① 本機寫改動（`_v3` 是唯一工作 checkout）

```powershell
# 動工前先同步
git -C _v3 pull --rebase origin main
git -C _v3 status --porcelain        # 應為空
```

- 只改「本次任務」相關檔案；**不得改其他窗口的 `docs/logs/` 日誌檔**。
- 本地可先做便宜的自檢（不是驗收依據）：

```powershell
pnpm -r typecheck        # 型別
pnpm -r build            # 建置
pnpm test                # 單元測試（不含 DB）
```

### ② 部署到備用站並實測（**核心步驟，不可跳**）

```bash
# 把本機改動送上去：二選一
# (a) 已 commit 的路徑——先推分支或 main，再讓備用站 pull
# (b) 未 commit 的實驗——用 patch 送進備用站（測過再回本機 commit）
```

**驗證用部署（VPS 107.174.241.48，SSH 埠 5522）**

```bash
ssh -p 5522 root@107.174.241.48 'set -e
  cd /root/shieldscan-trial-code
  git pull --ff-only origin main
  cd /root/shieldscan-trial
  docker compose build api web
  docker compose up -d api web
  docker compose ps
  docker compose logs --tail=30 api'
```

- **動用 `docker compose up -d --build` 前須確認**：備用站是禁關站，重建會短暫重啟其容器；未經使用者明確指示不得 `down`／刪除 volume／重設資料。
- 重建前先記下「目前版本」以備回退：`git -C /root/shieldscan-trial-code log -1 --oneline`。

### ③ 備用站測過才推 GitHub

```powershell
git -C _v3 add <本次相關檔案>
git -C _v3 commit -m '<type>（INTEG）: <做了什麼>'
git -C _v3 pull --rebase origin main      # push 前必做
git -C _v3 push origin HEAD:main
```

- commit 前綴：`feat:` `fix:` `docs:` `ci:` `chore:`；docs 類含 `（INTEG）`。
- 未在步驟②驗證通過前，**不要** commit 成「已完成」的訊息推上 main。

### ④ 累積到一個階段 → 正式站更新成備用站的樣子

```bash
ssh -p 5522 root@107.174.241.48 'set -e
  cd /root/APFS
  git pull --ff-only origin main
  docker compose build api web
  docker compose up -d api web
  docker compose ps'
```

- 若本次改動觸及 `infra/docker/postgres/init.sql`／schema，**先跑**冪等 schema 同步：
  `docker exec -i shieldscan-api-1 sh -c "node /app/scripts/init-db.mjs"`（或依 `docs/deploy-vps.md`）。
- 只改文件（`docs/**`、`*.md`）時**不需重建映像**：用
  `git -C /root/APFS diff --stat <舊>..<新> -- . ':(exclude)docs' ':(exclude)*.md'` 應為空。

### ⑤ 再從主站推 GitHub 確認同步

```bash
ssh -p 5522 root@107.174.241.48 'git -C /root/APFS push origin HEAD:main'
```

- VPS 已裝憑證（`/root/.git-credentials`，600），必要時可用此法確認兩側同步。
- 正常情況 GitHub 已在步驟③同步，這一步是「確認」而非「補推」。

## 1.6 例外路徑：純營運／基礎設施改動（不動 repo 程式）

適用：VPS 上的 cron、環境變數、compose 設定、容器層調整——**不改變任何 repo 檔案**，因此沒有「部署程式」可言。

1. 先在任何可丟棄處驗證機制（例：手動跑一次 cron 的實際指令，看輸出與資料落地）。
2. **涉及禁關站者先取得使用者同意**，再做變更；變更前先備份（例：`cp /var/spool/cron/crontabs/root /root/crontab-backup-<時間>`）。
3. 變更後**等一個週期**驗證真的生效（cron：看 log 檔時間與 DB `updated_at` 是否推進；不可只看「指令存在」）。
4. 記錄於當日 window 日誌（含指令原文、備份位置、驗證數據）；**不需**走步驟④⑤，但需確認兩站不再落後 main。

## 2. 部署後驗收清單（**每個步驟都要跑**）

```powershell
# (1) 服務存活
Invoke-WebRequest http://107.174.241.48:3080/ -UseBasicParsing | % StatusCode   # 備用站 web
Invoke-WebRequest http://107.174.241.48:3081/health -UseBasicParsing | % Content # 備用站 api
# 正式站同法測 :3000 / :3001
```

```bash
# (2) VPS 端：容器與日誌
docker compose -f /root/shieldscan-trial/docker-compose.yml ps
docker compose -f /root/shieldscan-trial/docker-compose.yml logs --tail=50 api | grep -iE 'error|fail'
```

- [ ] 目標頁面 200，且**內容是本次改動後該有的樣子**（不看 200 就當過）
- [ ] api `/health` = ok；api 日誌無新增 error／例外
- [ ] 若改動涉及資料寫入：查 DB 實際落地（`psql` 查該表最新一筆／時間）
- [ ] 若改動涉及兩站一致性：比對兩站關鍵 bundle／頁面標記（見 §3）
- [ ] 既有功能未被打破（至少測：首頁、`/admin`、本次改動相關路徑、一支既有 api）

## 3. 兩站一致性比對（正式站更新後必跑）

```bash
# web 頁面程式是否位元相同（md5）
docker exec shieldscan-web-1        sh -c 'cat /app/apps/web-scanner/.next/static/chunks/app/page-*.js' | md5sum
docker exec shieldscan-trial-web-1  sh -c 'cat /app/apps/web-scanner/.next/static/chunks/app/page-*.js' | md5sum

# api 程式是否位元相同
docker exec shieldscan-api-1        md5sum /app/apps/api/dist/server.js
docker exec shieldscan-trial-api-1  md5sum /app/apps/api/dist/server.js

# 程式 HEAD 與落後量
git -C /root/APFS log -1 --oneline;                  git -C /root/APFS rev-list --count HEAD..origin/main
git -C /root/shieldscan-trial-code log -1 --oneline; git -C /root/shieldscan-trial-code rev-list --count HEAD..origin/main
```

- 允許差異：`NEXT_BUILD_ID`、shared chunk 的內容雜湊（不同建置時間產生）——**頁面／路由程式 md5 相同**即可視為同版。
- 不允許差異：該次改動涉及的頁面／端點行為不一致。

## 4. 回退（出問題時）

| 情境 | 做法 |
|---|---|
| 備用站新版壞了 | `cd /root/shieldscan-trial-code && git checkout <上一個好 commit>` → `docker compose up -d --build api web` |
| 正式站新版壞了 | `cd /root/APFS && git checkout <上一個好 commit>` → `docker compose up -d --build api web`（**正式站優先恢復服務**） |
| 只是文件／記錄錯 | `git revert <commit>` 後 `pull --rebase` 再推；**嚴禁 force-push main** |
| schema 改壞 | `init-db.mjs` 為冪等，可重跑；必要時由備份還原（`pg_dump`） |

回退後要**照 §2 重跑驗收**，並在當日 window 日誌記明回退原因與 commit。

## 5. 完工必做（AGENTS.md §2）

1. `docs/logs/YYYY-MM-DD-INTEG-<主題>.md`（檔名唯一，含：目標 → 關鍵決策 → 改動檔案（含 commit 前綴）→ 驗證結果 → 未完成/待辦）
2. 里程碑級才更新 `CHANGELOG.md`（最新在上）
3. commit 訊息帶 `（INTEG）`
4. 依 §1 ③⑤ 推送；確認本機＝GitHub＝兩站 checkout 皆同步

## 6. 常見坑（已實際踩過）

- **VPS checkout 不等於執行中映像**：`git pull` 只換程式碼，**必須 rebuild** 才會生效（曾發生「程式 HEAD 已是新版、容器仍是舊映像」）。
- **映像內容可能落後同目錄程式 HEAD**：驗證一律以「容器內檔案」為準（`docker exec … md5sum`），不要只看 `git log`。
- **只改文件也要同步兩站 checkout**，否則下次 `git pull` 會出現非 fast-forward。
- **DB 資料不可跨站覆蓋**：正式站租戶數與備用站不同（37 vs 4），整庫覆蓋會刪租戶。
- **量測前先確認「站台指向」**：正式站 web 內嵌 API 為 `:3001`、備用站為 `:3081`，勿把流量記到錯的站。
