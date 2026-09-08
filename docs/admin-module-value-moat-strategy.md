# 管理者後台「檢測欄位模組分類」× 數據價值／護城河 戰略（定版補強 v2）

> 日期：2026-09-09（INTEG 窗口）
> 定位：**補強文件，不另立新分類**。分類主體沿用已定版
> [detection-module-optimal-plan.md](./detection-module-optimal-plan.md)（2026-09-06，四份 AI 輸入合併結論），
> 本文補上定版欠缺的兩個維度：**①哪些數據「有價格」②哪些數據構成護城河（核心＝設備指紋數據）**，
> 並對齊真實 code（`packages/core-schema`／`packages/browser-sdk`／`packages/repository`）與真實定價。
> 商業化總綱：[ShieldScan-0-1到商業化完整規劃.md](../ShieldScan-0-1到商業化完整規劃.md)。

## 0. TL;DR

1. 本 repo **已有** 後台分類定版（詳情頁 6 段：決策樞紐→異常矩陣→網路地理→硬體指紋→軟體環境→Raw JSON）；
   新輸入（「5 大模組＋sessions/fingerprints/risk_events＋RBAC＋JSONB」）與 Qwen3.8-Max 方案同源，已吸收，**不要再造第四份分類**。
2. 「有價格」的粒度不是單一欄位，而是三層賣法：**每次檢測（NT$1/單位）→ 場景模板加價 → 累積資料產品**。
3. 護城河＝**設備指紋 hash 群 × 跨 session 聚類 × 累積基準庫**：Canvas/WebGL/WebGPU/Audio 已採集落庫，
   Fonts/ClientRects/MediaDevices 是**已預留欄位但 SDK 未採**的 Gap——這正是下一輪該補的「真護城河欄位」。

---

## 1. 現況對照：新輸入 vs 定版 vs 真實 code（裁決表）

| 新輸入主張 | 定版（detection-module-optimal-plan） | 真實 code 現況 | 裁決 |
|---|---|---|---|
| 5 大模組（會話總覽/網路地理/硬體/軟體/異常） | 詳情頁 6 段（①決策②異常③網路④硬體指紋⑤環境⑥Raw） | — | 採**6 段**（把「異常/衝突」提前到第②段＝例外管理） |
| 主從式三表 `sessions/fingerprints/risk_events` | 維持 `EnvironmentReport` canonical＋三「查詢層」`risk_events/device_fingerprints/session_overview` | `zRiskEvent` 契約已在 core-schema；devices 表已存 hash 群 | 採**查詢層**（避免過度正規化）；命名 `session_overview` 勿與現有報告撞名 |
| RBAC 遮罩（客服看遮罩 IP，主管看全量） | §一.6 RBAC；Gap：管理 PIN 後接角色權限 | `FieldDefinition.accessRoles/sensitivity/retentionClass` 已存在欄位級骨架 | 擴充為**欄位級授權**（不只 IP），見 §5 |
| `open_ports` 結構化、22/3389 自動高危 | §一.7＋Gap「Port scan 結構化」 | `zRiskEventType.open_ports` 已定義 | 補**寫入＋規則點火**（server 端 port-scan 來源） |
| JSONB `raw`/`metadata` 開放結構 | §一.5 raw 保留＋§4.3 canonical JSONB | `EnvironmentReport.raw?: unknown`＋DB jsonb | 已具備，免改 |
| `privacy_score`（如 90%） | 分數雙軌（隱私/欺詐） | `scores{privacyExposure, authenticity, automationRisk, networkTrust, mobileIntegrity?, contentAbuseRisk?}` | 用**四軌分數**，不縮成單一分數 |
| 異常旗標 `is_bot/is_proxy/is_anonymous/in_blacklist` | 風險標籤清單 | `zRiskEventType` 17 類（bot_suspected/proxy_detected/blacklist_hit/…）＋severity | 用 risk event type 當 tags 來源 |

---

## 2. 哪些數據「有價格」（對齊 repo 真實定價）

定價事實來源：`packages/tenant/README.md`、根 `README.md`、`docs/sdk-integration.md`、`ShieldScan-0-1到商業化完整規劃.md`§四。

| Tier | 月費 | 額度 | 對應產品線 |
|---|---|---|---|
| Free | NT$0 | 每月 1,000 單位（API 呼叫） | 免費掃描網站 |
| Developer | NT$2,500/月 | 50,000 次呼叫＋基礎 Webhook | Risk API |
| Business | NT$25,000/月起 | 自訂量＋Dashboard＋SLA 99.5% | SDK Pro／企業 SaaS |
| Enterprise | 報價制 | 私有化、SSO、專屬節點 | 金融/大型平台 |
| **超量** | **NT$1/單位** | 付費計畫免費額度之外 | 用量計費 |

**計價結論（哪些數據有價格）**：

1. **逐次計價**：Risk API 每筆 `analyze / verify-session / IP reputation` 收費 → **所有欄位都有價格**（以呼叫次數計），不是欄位本身單賣。
2. **場景模板加價**：`streaming.* / policy.paymentRisk / policy.gameAntiCheat / authenticity+automationRisk+device_check` 等**規則套餐**是獨立售賣單元（最易定價，見 0-1 規劃 §四/最優合併 §第四批）。
3. **資料產品（晚點賣）**：匿名化風險基準、IP/指紋信譽 feed、威脅情報＝**累積後**的 rule_baselines/report_facts 與指紋頻次資料（初期資料不足不承諾精準率）。
4. **後台 UI 本身**：Dashboard/版面設定/ROI/審計屬 Business+；Enterprise 加 SSO/私有化——「管理者後台檢測欄位分類」的**每個模組應標 `valueTier`**，讓 /admin 只能看到自己方案授權的欄位（見 §5）。

---

## 3. 護城河分層：設備指紋數據是主體

備忘錄依據：定版 §一.4「設備指紋是跨 IP 追蹤核心，hash 應可跨 session 聚合與查詢」；module-marketplace 意向 D4「訪客設備指紋＋跨 session 聚類，讓『數字黃金』有真數據可餵」；0-1 規劃「累積讓對手追不上的資料資產」。

| 層級 | 代表數據 | 為什麼 | 是否護城河 |
|---|---|---|---|
| 🟢 通用層 | IP/ISP/geo/時區/語言/UA 基本欄位 | 任何檢測 API 都有，單點零差異 | ❌ 非護城河（但組成 IP 信譽語料） |
| 🟡 證據層 | open_ports 22/3389、os_mismatch、dns_leak、webrtc_mismatch、timezone/language_mismatch、ip_velocity、header_incoherence | 規則邏輯可被複製；**觸發樣本＋誤判回饋資料**難複製 | 🟡 半護城河（規則＋資料雙面） |
| 🔴 **核心指紋層** | **canvas_hash / webgl_hash / webgpu_hash / audio_hash / fonts_hash / client_rects_hash ＋ unmasked vendor/renderer ＋ screen/DPR/色深/觸控/deviceMemory/hardwareConcurrency** | 跨 IP/時區不變；**換 IP 也認得出同一設備**＝跨 session 聚類與黑名單的地基；瀏覽器防指紋（Safari/Brave）只會讓採集更難＝先採者優勢 | ✅ **真護城河** |
| 🧬 資料層（數字黃金） | `report_facts`（country/asn/tz/rules_hit）＋ `rule_baselines`（rule×dim hit_rate，兩站每 10 分鐘聚合） | 別人抄不到「別人的訪客」；基準分布 = 資料產品第一個可賣品 | ✅ 真護城河（時間累積型） |

### 3.1 設備指紋欄位現況（code 對照）

| 指紋欄位 | browser-sdk module | DB（devices 表） | 狀態 |
|---|---|---|---|
| Canvas hash | `modules/canvas.ts` ✅ | `canvas_hash` ✅ | 已採集 |
| WebGL（vendor/renderer hash） | `modules/webgl.ts` ✅ | `webgl_hash` ✅ | 已採集 |
| WebGPU（signals hash） | `modules/webgpu.ts` ✅ | `webgpu_hash` ✅ | 已採集 |
| Audio hash | `modules/audio.ts` ✅ | `audio_hash` ✅ | 已採集 |
| Fonts hash＋list | ❌ 無 module | `fonts_hash` **欄位已留** | **Gap（下輪補）** |
| Client Rects hash | ❌ 無 module | `client_rects_hash` **欄位已留** | **Gap（下輪補）** |
| Media devices 授權狀態 | ❌ 無 module | — | Gap（只取狀態不取流） |
| UA/Client-Hints | `modules/ua.ts`、`clientHints.ts` ✅ | report/signals | 已採集（WP4 一致性使用） |
| Screen/locale/timezone/webrtc | ✅ | report/signals | 已採集 |
| 7 天 IP 活躍數 | — | `network_signals.ip_history7d/30d`、device `ip_count/session_count` **欄位在、沒人算** | Gap（M1 WP2 實算） |

> **策略重點**：`fonts_hash/client_rects_hash` 的 DB 欄位已在 `risk-postgres`/`postgres` 建好但 SDK 從未採集——這是「欄位分類 vs 實際採集」落差的最小修復點，成本低、直接補齊 🔴 核心指紋層。

---

## 4. 模組分類定版建議（6 段 × 價值標記）

後台報告詳情頁 6 段，每段標 `valueTier` 與 `moatClass`（新增至 block/field 定義，見 §5）：

| 段 | 內容 | valueTier | moatClass | RBAC 備註 |
|---|---|---|---|---|
| ① 決策樞紐 | session/visitor ID、四軌分數、risk level、快速處置 | free（列表必用） | — | 客服可看遮罩版 |
| ② 異常矩陣 | 宣稱 vs 事實 vs 判定（OS/port/時區/geo/Canvas） | free | 🟡 證據 | port/OS 細節限 security 角色 |
| ③ 網路 IP 地理 | IP/ISP/7 天活躍/DNS 洩漏/WebRTC/端口 | developer+ | 🟡 證據 | **完整 IP/經緯度遮罩**：客服 `49.214.1.*` |
| ④ 硬體與設備指紋 | hash 群＋vendor/renderer＋screen/CPU/memory | **business+** | 🔴 核心指紋 | hash 群僅高權限角色；列表頁只顯示「同設備前次出現」 |
| ⑤ 瀏覽器與軟體環境 | OS/UA/語言/字體/外掛/DNT | developer+ | 🔴（字體 hash） | — |
| ⑥ Raw JSON 抽屜 | raw payload、複製 JSON | security 角色 | — | 預設收合 |

---

## 5. 落地工作包（供分派，依 AGENTS.md 規約）

> 每個工作包：開分支 `feat|fix|docs/<主題>` → 本機 typecheck/build → CI 全綠 → INTEG 合 main。

| 包 | 內容 | 檔案範圍 | 驗證 |
|---|---|---|---|
| **W1 指紋採集補齊（真護城河）** | browser-sdk 新增 `fonts`、`clientRects`、`mediaDevices`（狀態）module；hash 寫入既有 devices 欄位 | `packages/browser-sdk/src/modules/*`、`report.ts` | SDK 單測＋typecheck＋CI |
| **W2 欄位價值標記** | `FieldDefinition`（core-schema）補 `valueTier`/`moatClass` 維度（或收斂到既有 `accessRoles+sensitivity` 對應表）；admin 列表/詳情依 tier 顯示 | `packages/core-schema/src/index.ts`、dashboard-blocks.ts、web-scanner admin | typecheck＋E2E（低 tier 看不到高 tier 欄位） |
| **W3 欄位級 RBAC 遮罩** | 依 `accessRoles/sensitivity` 對報告 API 輸出遮罩（IP/經緯度/hash 群） | `apps/api`（reports 端點）、repository | 單測＋真實 PG（遮罩測試） |
| **W4 證據層規則點火** | `open_ports` 22/3389、os_mismatch、dns_leak 等 zRiskEventType 已定義 → 確認 server 寫入＋risk_events 列表可查 | `apps/api/src/server.ts`、scoring-engine | verify-scoring＋test:postgres |
| **W5 7 天 IP/velocity 實算** | device `ip_count/session_count`、`ip_history7d/30d` 由 tenant 內聚合實算＋`ip_velocity_anomaly` 規則 | repository、network-intel、scoring-engine | 規則觸發測試（in-memory）＋CI |
| **W6 跨 session 指紋聚類** | 依 hash 查同設備其他報告（device 詳情頁「同設備活動」）＋device profile | repository（查詢層）、web-scanner `/admin/devices` | E2E（跨 session 可見同一設備） |
| **W7 資料產品原型** | rule_baselines「罕見度」進評分（此規則在此 country/asn/tz 命中率）→ 計價面 | aggregate 腳本、scoring-engine、`GET /v1/baselines` | CI＋兩站 cron 觀察 |

---

## 6. 決策待確認（開放問題）

1. ④ 硬體指紋段／設備 hash 是否**本輪就 tier-gate**（僅 Business+ 可見完整 hash），還是先全開累積資料、等資料產品期再關？（關＝採集動機下降；開＝隱私/合規成本高——需治理決策）
2. `valueTier` 採「新維度」還是「既有 sensitivity/accessRoles 對應表」？（建議後者：零 schema 破壞）
3. W6 設備聚類是否併入 M1 WP2（device velocity 同包）？——建議同包一次做 device 統計面。
4. 資料產品（W7 基準計價）順位：交接備忘錄列為「下一大步」，是否插隊在 W1–W6 之前？

---

## 附：主要來源

- `docs/detection-module-optimal-plan.md`（分類定版）、`docs/risk-detection-platform-adopted-plan.md`
- `ShieldScan-0-1到商業化完整規劃.md`§四（產品線/定價）、`ShieldScan-最優合併方案規劃書.md`（插件批次）
- `packages/tenant/README.md`、根 `README.md`、`docs/sdk-integration.md`（Tier/NT$1 單位）
- `packages/core-schema/src/index.ts`（zSignalCategory/zSensitivity/zRetentionClass/zFieldDefinition/zRiskEvent/zRiskEventType/zEnvironmentReport/zScoreBundle）
- `packages/browser-sdk/src/modules/*`、`packages/repository/src/risk-postgres.ts`（devices hash 欄位）
- `docs/logs/2026-09-08-INTEG-rule-baselines.md`（report_facts/rule_baselines/聚合）
- M1-規劃.md（WP2 velocity／數據資產）、module-marketplace-intent.html（D4 指紋模組決策）

*本文由 INTEG 產生；落地執行請各工作包另開 docs/logs 當日檔並帶（代號）。*
