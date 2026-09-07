# ShieldScan（隱盾檢測）0.1.0 — Agent Teams Code Review 報告

> **審查對象**：`C:\Users\User\Documents\APFS\歸檔`（pnpm monorepo，main @ `cfbb540`，2026-09-05 快照）
> **審查方式**：6 個獨立 Agent 團隊（每團隊以不同專業視角逐檔審讀）＋ 獨立驗證 agent 對全部 Critical/High 宣稱回查原始碼 ＋ 主審對關鍵宣稱逐行覆核
> **範圍**：apps/api、apps/web-scanner、packages/*（13 套件）、plugins、scripts、.github/workflows、docker-compose、infra、docs —— 約 66 個一線原始檔、5,000+ 行 TS/SQL/shell/CI
> **產出語言**：繁體中文（技術識別碼保留英文）

---

## 1. Agent Teams 編制與分工

| 團隊 | 審查視角 | 主要範圍 |
|---|---|---|
| T1 資安與信任邊界（Security & Trust） | 認證/授權/租戶隔離、簽章信任模型、SSRF、Webhook、個資隱私、輸入驗證、secret | server.ts、signing、tenant、repository、core-schema、browser-sdk/report.ts、openapi |
| T2 API 後端正確性（Backend Correctness） | 契約漂移、雙 store 語意、SQL/init.sql、錯誤處理、限流、計費冪等、驗證腳本盲點 | server.ts、repository、tenant service、verify-prod-storage.mjs |
| T3 檢測與評分邏輯（Detection & Scoring） | 指紋採集/雜湊正確性、評分數學、規則觸發、network-intel、port-scanner、policy | browser-sdk modules、scoring-engine、network-intel、port-scanner、core-schema |
| T4 Web 前端與隱私流程（Web / Frontend & Privacy） | 同意機制、上送路徑、渲染安全、Next/React 正確性、E2E 穩定性 | web-scanner src/e2e、react-sdk、report.ts |
| T5 SDK / 插件 / DX | 假驗證 API、react peerDeps、文件範例、npm 打包、dist 自舉測試、plugin roadmap | node-sdk、react-sdk、signing、plugin-cli/runtime、examples |
| T6 基礎設施 / CI / 腳本（Infra） | Dockerfile/compose、init.sql 三源一致、workflow 順序、腳本錯誤處理、secret 預設 | Dockerfile×2、compose×2、Caddyfile、workflows、scripts、init.sql |

**流程**：① 每團隊獨立讀檔（只讀、不修改）並以「證據引句＋行號」出 findings → ② T1 的 6 條 High 全數經獨立驗證 agent 回查為 `confirmed`（含修正精確位置）→ ③ 主審親自通讀 `server.ts`（556 行）並對 T2–T6 關鍵宣稱逐行/grep 覆核（覆核紀錄見 §7）。重複或同根因的發現（如「signature 必填 vs 匿名上送」「XFF 信任」「保留期未清理」「全域共享 secret」）已跨團隊合併呈現，統計以原始 53 條計、未去重。

---

## 2. 執行摘要（最重要的 6 個系統性主題）

**① 信任邊界尚未建立，多租戶資料等同「單一全域池」。** 資料表（`fingerprint_scans`/`visitor_profiles`）沒有 `tenant_id`，`GET/DELETE /v1/reports/:id` 與 `/v1/visitors/:visitorId` 只要求「任一有效 API Key」，不做歸屬過濾（server.ts:425-477）→ 任一租戶 key 可跨租戶讀取／濫刪（含 GDPR 誤刪）。API Key 只有雜湊簽發、**無撤銷/輪換**（`revokedAt` 全 repo 無任何寫入路徑），洩漏無法止血。

**② 簽章信任模型目前不可作為安全閘。** 全域單一 `REPORT_SIGNING_SECRET`（server.ts:50）由文件教導派發進瀏覽器 bundle（docs/sdk-integration.md:49）；HMAC 輸入不涵蓋 `subjectId/consent/retentionDays/issues/scores`（signing/src/index.ts:37-46）→ 任一持 key 方可偽造他人報告、竄改個資欄位與跨訪客污染。node-sdk 另 export 一支**假驗證** `verifyReportIntegrity`（只查字串非空，node-sdk/src/index.ts:66-76）卻寫入 README 為已交付能力。

**③ 產品主流程（匿名上送）實際是死的。** core-schema 要求 `signature: z.string().min(1)`（core-schema/src/index.ts:152），而 SDK/網站在未配 secret 時產出 `signature: ''`（report.ts:62-67）→ 每次 `POST /v1/reports` 在 zod 階段即 400；官方 `verify-prod-storage.mjs` 的第一道 201 檢查必然失敗。網站 E2E 用 `route.fulfill` mock 掉真實伺服器，綠燈反而掩蓋此缺陷。

**④ 評分可被送報告者完全操控，且多數規則靜默失效。** 分數直接消費**客戶自報**的 `report.issues`（server.ts:375），簽章又不涵蓋 issues、匿名免簽 → 送報告者可自植 `os_mismatch` 等扣分或刪光 issues 換 100 分。同時 scoring-engine 的規則期待 `'dns_leak'/'webrtc_leak'/'unusual_open_ports'/'bot_detected'` type 與 `canvas.isTampered` 訊號 key，而實際 producer 輸出 `'webrtc_local_ip'`/`'canvas_tampered'`/key `'canvas'`（analyze.ts:57,97）→ 多數規則永不觸發。

**⑤ 隱私承諾與實作有實質落差。** ① `local-only` 模式仍對 Google/Twilio 公開 STUN 送公網 IP（webrtc.ts:17-19）；② `expires_at` 只寫不讀、無任何清理 job，`local-only` 報告也照樣落庫（postgres.ts:97-99）；③ 前端「四維評分」是 `finalScore` 的鏡像偽造（analyze.ts:113-116、page.tsx:52-55），誤導使用者與下游契約。

**⑥ 部署/CI 官方主流程目前跑不綠。** web Dockerfile `COPY .../public`（不存在該目錄）→ build 必敗；`deploy-vps.sh` 的 smoke 以預設 `dev-only-change-me` 簽章對上正式隨機 secret（且匿名上送 `signature=''` 被 zod 400）→ 冒煙必敗；`ci.yml` 在套 schema 前就執行含 postgres 整合測試的 Unit tests → 必紅。原 agent 另宣稱「root `test:postgres` 路徑重複會 Could not find」——**經本機實測推翻**（指令正常執行）。兩份 compose 預設弱密碼並將 5432/6379 綁 0.0.0.0。

> 正面基調：SQL 全參數化、zod `.strict()` 單一契約、API Key SHA-256 儲存、簽章 constant-time compare、雙 store 刪除語意與 GDPR 連動刪除方向正確、schema 三源（init.sql/postgres.ts/tenant postgres.ts）逐欄一致、評分純數學與 README 85 分一致——詳見 §6。

---

## 3. 統計

| 團隊 | C | H | M | L | I | 小計 | 備註 |
|---|---|---|---|---|---|---|---|
| T1 資安 | 0 | 6 | 5 | 1 | 1 | 13 | High 全數經獨立驗證 confirmed |
| T2 後端 | 1 | 4 | 4 | 0 | 0 | 9 | 第 2 輪產出 |
| T3 檢測/評分 | 1 | 2 | 5 | 0 | 0 | 8 | 第 2 輪產出 |
| T4 Web/隱私 | 0 | 2 | 4 | 2 | 0 | 8 | 第 2 輪產出 |
| T5 SDK/插件 | 0 | 1 | 4 | 1 | 1 | 7 | 第 2 輪產出 |
| T6 Infra/CI | 0 | 3 | 1 | 2 | 1 | 7 | 原 4H 中 1 條（test:postgres 路徑）經實測推翻，見 §7b |
| **合計** | **2** | **18** | **23** | **6** | **3** | **52** | 未去重（含已推翻 1 條） |

---

## 4. P0/P1 優先修復清單（跨團隊去重後 12 條）

| # | 優先 | 問題 | 位置 | 建議修法 |
|---|---|---|---|---|
| 1 | P0 | 評分/政策取信客戶自報 `issues`，簽章不涵蓋 → 可任意操控分數（C） | apps/api/src/server.ts:375；packages/signing/src/index.ts:37-46 | server 由 signals/NetworkAnalysis 自行產生 AnalysisIssue；簽章納入 issues 雜湊 |
| 2 | P0 | Postgres `ON CONFLICT (visitor_id,session_id)` 部分更新，同 session 新報告覆寫舊列且 201 的 reportId 未落庫 → 資料半毀（C） | packages/repository/src/postgres.ts:61-102 vs in-memory.ts | 定唯一性語意：改以 report_id 主鍵每報一列，或完整回寫+明示覆寫；補雙 store 行為矩陣測試 |
| 3 | P0 | 無租戶所有權：任一有效 key 可跨租戶讀/刪報告與 visitor（H） | apps/api/src/server.ts:425-477；init.sql 無 tenant_id | 資料加 tenant_id（null=公共）＋所有讀寫以 auth.tenant 過濾 |
| 4 | P0 | `requestIp` 無條件信任 X-Forwarded-For → port-scan SSRF、繞限流、畸形值使 PG `INET` 寫入 500（H） | apps/api/src/server.ts:106-116,510-543 | 不信任 XFF（取 socket IP 或白名單 proxy）；寫庫前 zod 驗 IP；限流改 Redis |
| 5 | P0 | 全域共享 HMAC secret 派發到瀏覽器端；MAC 未涵蓋 subjectId/consent/retentionDays（H） | server.ts:50；docs/sdk-integration.md:49；signing 33-46 | per-tenant/per-session key（server 簽發）；簽署全部影響儲存欄位；未設 secret 時 fail-fast |
| 6 | P0 | schema 強制 `signature min(1)` vs 匿名免簽 → 官方主流程 400 死路（H，三團隊重複發現） | core-schema/src/index.ts:152；report.ts:62-67 | signature 改 optional（或完整性 optional），明訂 unsigned 匿名語意；加不打 mock 的整合測試 |
| 7 | P1 | Webhook：任意 https/localhost 可註冊、投遞無 redirect 防護/無簽章、events 未過濾、同步阻塞 ingest、僅存記憶體（H） | server.ts:159-194,314-344 | 註冊+投遞前解目標 IP 排除私網；限 redirect；payload HMAC；持久化 + 背景佇列 |
| 8 | P1 | API Key 無撤銷/輪換/列舉（H） | tenant service/store；server.ts:285-294 | 補 revoke/list/rotate 端點與 store 方法 |
| 9 | P1 | 保留承諾未落實：`expires_at` 只寫不讀、local-only 照樣落庫（H） | postgres.ts:97-99；server.ts:383-392 | 定期清理 job；server 拒收 local-only；retentionDays 設上限 |
| 10 | P1 | web Dockerfile COPY 不存在的 `public/` → compose build 必敗（H） | apps/web-scanner/Dockerfile:30 | 刪該行或補 public 目錄；CI 加 docker build |
| 11 | P1 | smoke/CI 主流程必紅：smoke 用預設 secret（且匿名 `signature=''` 被 400）、ci.yml 在套 schema 前跑 postgres 整合測試（H×2；原稱的 `test:postgres` 路徑問題經實測推翻） | scripts/deploy-vps.sh:42-44；smoke-compose.mjs:15,49,57；.github/workflows/ci.yml:33-60 | smoke 由容器讀實際 secret；Apply schema 移到 Unit tests 之前；CI 加 docker build 步驟 |
| 12 | P1 | 前端上送安全：NEXT_PUBLIC_API_URL 預設 localhost、local-only 仍走公開 STUN（H×2） | web Dockerfile:11-12；api.ts:42-44；webrtc.ts:17-19 | 缺正式網域即 build error；local-only 停用 STUN 或延後至同意 |

---

## 5. 依團隊完整發現

### T1 資安與信任邊界（6H / 5M / 1L / 1I）

**High**
1. **跨租戶 IDOR／誤刪**：`GET/DELETE /v1/reports/:id`、`/v1/visitors/:visitorId/reports`、`DELETE /v1/visitors/:visitorId` 僅驗證「任一有效 key」，repository 無 tenant 維度（server.ts:425-477；repository/postgres.ts:64-76；init.sql:9-32）— *驗證：confirmed*
2. **XFF 信任 → port-scan 任意目標 SSRF + 繞限流**：`X-Forwarded-For` 存在即優先採用（server.ts:106-116），port-scan 以之為目標並以其為限流鍵（510-543）— *confirmed*
3. **全域共享 HMAC secret，MAC 涵蓋不足**：單一 `REPORT_SIGNING_SECRET`（server.ts:50）；canonical payload 僅 reportId/sessionId/schemaVersion/createdAt/nonce/timestamp/signalsHash，不含 subjectId/consent/retentionDays/tenantId（signing 33-46；sdk-integration.md:47-50）→ 可互相偽造與竄改個資欄位 — *confirmed*
4. **Webhook SSRF + 無簽章投遞**：僅 scheme 白名單放行任意 https 主機與 `http://localhost:<任意埠>`；`fetch` 不限制 redirect、無 HMAC/secret（server.ts:314-338、182-187）— *confirmed*
5. **API Key 無撤銷/輪換/列舉**：`revokedAt` 欄位存在但全 repo 無寫入路徑；TenantStore 介面無 revoke/list（tenant/service.ts:59-67；store/types.ts:8-18）— *confirmed*
6. **保留承諾未落實**：`expires_at` 僅寫入（postgres.ts:97-99），無任何清理 job；consent `local-only` 亦照樣落庫與 upsertVisitor（server.ts:379-392）— *confirmed*

**Medium**：7) 匿名/已簽章分流矛盾（signature 必填→公開站上傳 400；拔 Authorization header 即跳過計費）；8) zod 幾乎只有下限無上限 + `/v1/reports`、`/v1/analyze`、`/v1/network/self` 匿名無限流（retentionDays 極大可致 `toISOString()` RangeError 500）；9) `GET /v1/audit-logs` 無認證、純記憶體、actor/target IP 可被 XFF 偽造（DB 表已建未用）；10) 註冊 `plan` 由 body 自選（含 0 元 enterprise）、email 不驗證、免費額度只算帳不強制、用量只在帶 key 時計；11) compose 弱預設 secret（`shieldscan`/`dev-only-change-me`）＋ 5432/6379/3001/3000 綁 0.0.0.0、redis 無 requirepass。
**Low/Info**：GeoIP provider 走明文 http 且無快取（ip-api.ts:26-30）；node-sdk `verifyReportIntegrity` 為 stub（與 T5 重複）。

### T2 API 後端正確性與資料完整性（1C / 4H / 4M）

**Critical**
1. **`saveReport` ON CONFLICT 半更新**：`(visitor_id, session_id)` 衝突時只更新 signals/issues/scores/privacy_score/grade/risk_level，`report_id/created_at/integrity/raw/expires_at` 保留舊值 → 新內容配舊 ID 的混合列、201 回報的 reportId 查無此筆；in-memory 以 reportId 為鍵每報一列，兩 store 不等價（postgres.ts:70-76,95-99；init.sql:31；in-memory.ts:12-29）— *主審覆核 confirmed（逐行讀過）*

**High**
2. **四個 POST endpoint 對無 body 請求 500 而非 400**：`/v1/tenants`、`/v1/tenant/keys`（正常用法即無 body，必然 500）、`/v1/webhooks`、`/v1/port-scan` 直接取值 request.body（server.ts:258-294,314-338,510-543）— *主審覆核 confirmed*
3. **XFF 畸形值使 Postgres ingest 整筆 500**：XFF 未驗證即寫入 `client_ip INET`／`ip_history INET[]`（init.sql:20,54）→ `garbage` 拋 pg inet parse error；同值可繞 port-scan 限流（server.ts:106-116,510-543；postgres.ts:87,149）
4. **signature 必填 vs 匿名免簽矛盾**，使官方 verify-prod-storage 的 201 檢查恆失敗（core-schema:152；server.ts:145-157,351-352；verify-prod-storage.mjs:58-73,160）
5. **verify-prod-storage 盲點**：`reuseApi` 可能複用到與目標 DATABASE_URL 無關的舊 API（verify-prod-storage.mjs:99-116）；Redis PING（:139-140）對「儲存切換」無鑑別力（全 repo 無 Redis client）

**Medium**：6) key 60/min 逾限回 401 而非 429，且 `/v1/reports` 把被限流租戶靜默降級為匿名收案（免簽、免計費）（server.ts:135-143,356-359,394-396）；7) `plan` 無 runtime 白名單、同期發票可重複開（無 UNIQUE/冪等）（server.ts:263-267,306-311）；8) openapi.yaml 自稱唯一契約卻重複 path key、漏 `/v1/tenant/keys`、GET security 標註不符、201 回應 schema 過時（openapi.yaml:75-97,385-420）；9) 無 graceful shutdown（pool 從不 close），webhook/審計/限流全 in-memory、DB 表閒置（server.ts:551-556）。

### T3 檢測與評分邏輯（1C / 2H / 5M）

**Critical**
1. **評分採信客戶自報 issues 且簽章不涵蓋** → 分數/政策可被送報告者操控（server.ts:350-375；signing:37-55；web analyze.ts:104-109）

**High**
2. **SDK 預設 `signature:''` 違反 schema min(1)** → unsigned 報告 zod 必敗（report.ts:62-74；core-schema:150-158）
3. **defaultRules 與 producer 全面斷鏈**：規則等 `dns_leak/webrtc_leak/unusual_open_ports/bot_detected` type 與 signal key `canvas.isTampered`，實作產生 `webrtc_local_ip`（analyze.ts:97）與 key `canvas`（canvas.ts:32）→ 多數規則永不觸發 — *主審 grep 覆核 confirmed（scoring-engine:95-141 vs canvas.ts/analyze.ts）*

**Medium**：4) `detectDnsLeak` 從未解析 dnsServers 內容，實為 ISP 字串比對（analyze.ts:31-46,71）；5) `isPublicIp` 漏 CGNAT 100.64/10、169.254/16、198.18/15 等且完全忽略 IPv6（analyze.ts:3-29）；6) ip-api 預設明文 http，風險欄位可被 MITM 偽造（ip-api.ts:26-33）；7) audio 模組未讀 analyser 資料即播放 300ms 音調，指紋實為 sampleRate（audio.ts:17-34）；8) webrtc 固定 sleep 500ms 而非等 gathering complete，localIps 殘缺、漏 IPv6（webrtc.ts:24-33）。

### T4 Web 前端與隱私流程（2H / 4M / 2L）

**High**
1. **local-only 仍經公開 STUN 洩漏公網 IP**，與同意契約「不傳送到伺服器」矛盾（webrtc.ts:17-19 vs consent-banner/privacy 頁宣稱）— *主審 grep 覆核 confirmed*
2. **網站上送路徑實際壞死**：空 signature 被 zod 400 全數打回（同 T1/T2/T3 根因）；e2e 以 route.fulfill mock 遮蔽真實驗證（analyze.ts:104；api.ts:50-64；scanner.spec.ts:108-136）

**Medium**：3) `NEXT_PUBLIC_API_URL` build 期內嵌且預設 localhost → 正式站訪客瀏覽器把整包指紋 POST 到「自己本機」（api.ts:42-44；Dockerfile:11-12；compose:63）；4) 四維評分是 finalScore 鏡像偽造並在兩處重複（analyze.ts:111-117、page.tsx:51-56）；5) issue type 錯配（`webrtc_local_ip` vs 規則 `webrtc_leak`）→ 顯示有洩漏卻永不扣分；6) E2E 把 P95<3000ms 放進回歸閘，CI 必抖（scanner.spec.ts:56-80）。
**Low**：7) 隱私頁宣稱的「可刪除本機資料／每個扣分說明如何修復」無對應 UI/欄位；8) next.config.mjs 無任何安全 headers（CSP/X-Frame-Options 等）。

### T5 SDK / 插件 / 開發體驗（1H / 4M / 1L / 1I）

**High**：1. **`verifyReportIntegrity` 假驗證**：只查 nonce/signature/secret 非空，從未驗 MAC，卻以「完整性驗證」名義 export 並寫入 README（node-sdk/src/index.ts:66-76；README:7）— *主審覆核 confirmed*
**Medium**：2) react-sdk 把 react 放 dependencies、無 peerDependencies → 雙份 React（package.json:25-29）；3) react-sdk README / docs/sdk-integration.md 範例 import 未 export 的 `canvasModule/webgpuModule`，照抄即編譯失敗；4) tenant 把執行期相依 `pg` 放 devDependencies（hoist 遮蓋），多套件缺 license/sideEffects/publishConfig；5) 測試以 dist 自舉（tsconfig.test.json include 只含 test、自我引用 import 打到 dist）→ 測舊碼、乾淨 checkout 未 build 即失敗（signing/repository/network-intel/port-scanner/tenant）。
**Low/Info**：`useShieldScan` 空依賴陣列、unmount 無清理；plugin「Kernel/沙箱」目前僅 interface + manifest、無任何載入/執行機制（純 roadmap）。

### T6 基礎設施 / CI / 腳本（3H / 1M / 2L / 1I；原 4H 含 1 條已推翻）

**High**
1. **web Dockerfile COPY 不存在的 `public/`** → `docker compose build` 必然失敗（apps/web-scanner/Dockerfile:30；目錄實測不存在）— *主審覆核 confirmed*
2. **VPS 冒煙以 dev-only secret 簽章** → 正式部署冒煙必 401 且 `set -euo pipefail` 中止（deploy-vps.sh:42-44；smoke-compose.mjs:11,15；vps-bootstrap.sh:53-54）— *主審覆核 confirmed（腳本已讀）*
3. **ci.yml：Unit tests 在套 schema 前執行 postgres 整合測試**（job 級 DATABASE_URL 使 skip 失效）→ CI 恆紅（ci.yml:33-60；postgres.test.ts:12,54）
4. ~~root `test:postgres` 路徑重複~~ **已推翻（本機實測）**：`pnpm --filter … exec` 只改變其子程序 cwd，`&&` 後半段 `node --test packages/repository/dist-test/postgres.test.js` 仍在 repo root 執行、檔案存在。實跑 `pnpm test:postgres`（無 DATABASE_URL）exit 0：tsc 編譯 → node --test 正常載入 1 test（skip）→ 無任何 "Could not find"。此步驟在 CI 的真正風險是「schema 未套用」等環境問題，而非路徑。
**Medium/Low/Info**：5) 兩份 compose 漂移且弱預設（infra 版硬編碼密碼、含 `clickhouse:latest`、無 healthcheck）；6) P99 公式在 n<100 時恆取最大值（verify-prod-storage.mjs:204-206）；7) 兩份 Dockerfile 以 root 執行、api runtime 整包複製含 devDeps 的 node_modules；8) `expires_at/retention_days` 只寫不讀（同 T1/T2）。

---

## 6. 做得好的地方（跨團隊彙整）

- **契約先行**：core-schema zod `.strict()` 單一來源推導型別，`validateEnvironmentReport` 三處統一使用，400 錯誤 body 結構一致。
- **SQL 安全基線**：repository 與 tenant 的 PostgreSQL 全參數化（$1..$20）、無字串拼接；init.sql 含 CHECK 約束；schema 三源（init.sql ↔ postgres.ts ↔ tenant postgres.ts）逐欄一致。
- **密碼學細節正確**：API Key 僅存 SHA-256 hash、明文只回傳一次；signing 的 constant-time compare、5 分鐘時效、排除 signature 自我參照，測試涵蓋竄改/錯 secret/過期。
- **GDPR 方向正確**：`deleteVisitor` 兩 store 都連動刪除 fingerprint_scans；repository 刪除回傳「是否真的刪除」支援冪等語意；ipHistory 兩端去重。
- **端口掃描有安全框架意圖**：埠白名單、每小時上限、審計寫入——問題只在呼叫端信任 XFF。
- **同意分流閘門與渲染安全**：local-only 預設不上送（page.tsx:48）、首幀固定 local-only 避免 hydration mismatch；全站無 dangerouslySetInnerHTML/無動態 href。
- **工具鏈一致性**：pnpm 11.19.0 / Node 22 / PG16 / Redis7 在 workflows 與 compose 全鏈一致、皆 `--frozen-lockfile`；dev-db.mjs 對 Windows locale 有具體處理。
- **評分數學無誤**：clamp/門檻/「85 分」與 README 一致；SDK scan() 以 failed 事件隔離模組失敗；canonical 序列化確定性好。

---

## 7. 覆核紀錄（主審親查）

| 宣稱 | 覆核方式 | 結果 |
|---|---|---|
| XFF 信任 + port-scan 用 requestIp 掃描 + 限流同鍵 | 通讀 server.ts:106-116,510-543 | ✅ 屬實 |
| GET/DELETE reports/visitors 僅要求任一 key、無 tenant 過濾 | 通讀 server.ts:425-477 | ✅ 屬實 |
| POST /v1/tenant/keys 空 body → TypeError 500 | 通讀 server.ts:285-294 | ✅ 屬實 |
| core-schema `signature: z.string().min(1)` 必填 | 讀 core-schema:150-157,191 | ✅ 屬實 |
| postgres ON CONFLICT (visitor_id,session_id) 部分 DO UPDATE | 讀 postgres.ts:61-102 | ✅ 屬實 |
| `client_ip INET` / `ip_history INET[]`（XFF 畸形值 crash） | grep init.sql:20,54 | ✅ 屬實 |
| `expires_at` 僅寫入無清理 | grep 全 repo | ✅ 屬實 |
| `revokedAt/revoked_at` 無任何寫入路徑 | grep 全 repo *.ts（4 命中皆定義/讀取/映射） | ✅ 屬實 |
| 規則 type/key 與 producer 錯配 | grep scoring-engine（95-141）vs canvas.ts/analyze.ts | ✅ 屬實 |
| local-only 仍用 Google/Twilio STUN | grep webrtc.ts:17-19 | ✅ 屬實 |
| 前端四維分數鏡像偽造、雙處重複 | grep analyze.ts:113-116、page.tsx:52-55 | ✅ 屬實 |
| node-sdk 假驗證（非空字串檢查） | grep node-sdk:66-76 | ✅ 屬實 |
| web Dockerfile COPY 不存在的 public/ | Test-Path（False）+ 讀 Dockerfile:30 | ✅ 屬實 |
| smoke 用預設 secret、deploy 不 source .env | 讀 deploy-vps.sh、smoke-compose.mjs:15 | ✅ 屬實 |

> 標註「confirmed」的 T1 條目另經獨立驗證 agent 回查原始碼（含修正精確行號）。

---

## 7b. 實測補跑紀錄（依用戶要求重跑 typecheck / 驗證第 6 點宣稱）

**環境**：Node v24.20.0、pnpm 11.24.0（corepack shim，repo 指定 11.19.0）、**無 Docker**（無法實跑鏡像建置/GitHub Actions，該類宣稱以靜態驗證為主）。

| 指令/檢查 | 結果 | 對宣稱的影響 |
|---|---|---|
| `pnpm -r typecheck`（16/17 workspace 專案） | ✅ exit 0，全部 typecheck 通過 | 第 6 點與型別無關；type error 非 CI 卡關原因 |
| `pnpm test:postgres`（無 DATABASE_URL） | ✅ exit 0：tsc 編譯 → `node --test` 正確載入 1 test（skip） | **推翻**「test:postgres 路徑重複 → Could not find」宣稱 |
| `pnpm --filter @shieldscan/repository exec …` cwd 語意 | ✅ 實測 exec 只改子程序 cwd（`&&` 後半段在 root） | 同上，路徑宣稱不成立 |
| `Test-Path apps/web-scanner/public` | ❌ 不存在（兩次確認） | **確認** web Dockerfile:30 `COPY public` → build 必敗（Docker 語意：來源目錄不存在即報錯） |
| ci.yml 逐行讀取（:33-34, :56-63） | job 級 `DATABASE_URL` 套用所有步驟；Unit tests（含 repository postgres.test，skip 條件失效）在 Apply schema **之前** | **確認**「CI 在空 schema 上跑 postgres 整合測試 → 必紅」（GitHub Actions 無法本機複現，屬高置信靜態判定） |
| smoke-compose.mjs / deploy-vps.sh / vps-bootstrap.sh 讀取 | 匿名路徑硬寫 `signature=''` 期待 201（:49,57）；簽章以 host 預設 `dev-only-change-me`（:15,75）；deploy 不 source .env；host 需先有 `packages/signing/dist` | **確認**「smoke 對正式 secret 必 401 / 匿名必 400 / host 缺 dist 即掛」整條鏈 |
| 兩份 docker-compose 讀取 | root 版 `:-(shieldscan/dev-only-change-me)` 弱預設＋0.0.0.0；infra 版硬編碼 `POSTGRES_PASSWORD: shieldscan`、`clickhouse/minio:latest`、redis 無 healthcheck/密碼 | **確認**「兩份 compose 漂移＋弱預設」 |

**結論**：第 6 點（部署/CI 主流程）中 **3 個主因確認**（web Dockerfile public、smoke secret/匿名 400、CI schema 順序）；**1 個子宣稱被推翻**（`test:postgres` 路徑 bug——實測正常，真正風險是 schema 順序）。

---

## 8. 跨團隊開放問題（需要產品/架構決策）

1. 報告/訪客資料是「全域單一池」還是需逐租戶隔離？公共掃描器與租戶 SDK 資料的 owner 規則由誰定義？（卡住 T1/T2 多條修法）
2. 匿名上送是否應允許 unsigned？是否引入 server 簽發的 per-session secret？（卡住 signature schema、計費分流、驗證腳本）
3. 同 `(visitor_id, session_id)` 重複上報語意：更新單列 vs 每報一列？（決定 Critical #2 修法）
4. Redis 的角色：目前限流/Webhook/audit 全 in-memory，compose/workflows 卻掛 Redis——正式版何時接線？（影響 verify 閘門定義）
5. `retentionDays/expires_at` 清理責任方與排程設施（pg_cron？worker？）？
6. local-only 的「不離機」邊界：是否允許任何第三方 egress（STUN）？
7. web Dockerfile 的 `public/` COPY 與 CI 綠燈歷史——此鏡像是否從未成功建置過？

---

*本報告為唯讀審查產物，未修改 repo 內任何檔案。統計與行號以快照 `cfbb540` 為準；修復時請以當下 HEAD 重新核對行號。*
