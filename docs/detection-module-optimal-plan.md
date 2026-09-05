# 檢測欄位模組分類 — 四模型輸入之最優解規劃

> 日期：2026-09-06
> 輸入：Gemini 3.1 Pro、gemini-3.8-flash（基礎版）、gemini-3.8-flash（跨學科策略版）、Qwen3.8-Max 共四份「檢測欄位模組分類規劃」。
> 後續定版：已併入「嚴謹查證模式 3 — 風險偵測管理平台」，完整導入規劃見 [risk-detection-platform-adopted-plan.md](./risk-detection-platform-adopted-plan.md)。

## 一、四份輸入的共識（不需要再爭論的部分）

1. **不要照前端/API 欄位平鋪**：後台是給管理者「做裁決」，不是「看數據」。
2. **風險優先**：異常、衝突、高危端口必須置頂或打紅標，不能藏在最後一頁。
3. **分離「隱私防護」與「欺詐威脅」**：Brave 的 Canvas 篡改應標為低風險隱私行為；Port 22/3389＋OS 衝突才是高風險。
4. **設備指紋是跨 IP 追蹤核心**：Canvas/WebGL/WebGPU/Audio/Fonts 的 hash 應可跨 session 聚合與查詢。
5. **原始 Payload 必須保留且可除錯**：JSONB/raw 欄位，預設收合，供工程師展開。
6. **必須有 RBAC**：客服看到遮罩 IP＋粗略地區；資安/風控主管才能看完整 IP、經緯度與指紋。
7. **規則引擎要「可自動化」**：不能只存字串，端口等資料必須結構化，才有警報與處置。

## 二、四份方案的差異（哪些點值得吸收）

| 方案 | 分類數 | 最值得吸收的點 |
|---|---|---|
| Qwen3.8-Max | 5 模組 | 資料庫正規化（sessions/fingerprints/risk_events）、JSONB 開放結構、RBAC 遮罩、列表「例外管理」 |
| Gemini 3.1 Pro | 4 模組 | 綜合風險儀表置頂、Tag 標籤化、差異紅字高亮、一鍵封鎖/黑名單 |
| gemini-3.8-flash 基礎版 | 6 模組＋頂部處置列 | 左右欄 65/35 佈局、快速處置按鈕、時間一致性矩陣、Raw JSON 檢視器 |
| gemini-3.8-flash 跨學科版 | 5 層決策架構 | 「宣稱 vs 物理事實 vs 異常熵」三本質、風險雙軌制（隱私 vs 欺詐）、指紋聚類索引、0.5 秒決策區 |

## 三、最優解（推薦架構）

### 3.1 後台「報告詳情頁」模組順序（由總結到細節）

```text
① 決策樞紐與快速處置（Verdict & Actions）
② 異常與一致性矩陣（Conflict & Consistency）
③ 網路、IP 與地理（Network, IP & Geo）
④ 硬體與設備指紋（Hardware Fingerprint）
⑤ 瀏覽器與軟體環境（Browser & Environment）
⑥ 原始資料抽屜（Raw JSON / Developer）
```

### ① 決策樞紐與快速處置

- 訪客/會話 ID（可複製）、綜合評分（0–100）、風險等級。
- 風險標籤：`[疑似雲端/模擬器]`、`[OS 衝突]`、`[隱私防禦（Brave）]`、`[端口異常]`、`[DNS 洩漏]`。
- 快速動作：加入白名單、標記可疑、加入黑名單/封鎖、匯出報告（JSON/PDF）。

### ② 異常與一致性矩陣（最重要、不可省略）

以「宣稱狀態 vs 物理事實 vs 判定」呈現：

| 審計維度 | 宣稱 | 事實/底層 | 判定 | 等級 |
|---|---|---|---|---|
| OS | UA Android 10 | Platform Android 14.0.0 | 版本衝突 | ⚠️ 中（偽裝） |
| 端口 | 手機連線 | 監聽 22/3389 | 端口異態 | 🚨 高 |
| 時區時間 | IP Asia/Taipei | JS Asia/Taipei | 一致 | ✅ |
| 地理/語言 | 台灣板橋＋zh-TW | 經緯度符合 | 一致 | ✅ |
| Canvas | 標準瀏覽器 | hash 被重寫 | 隱私防禦 | ℹ️ 低 |

### ③ 網路、IP 與地理

- 公網 IP／ISP／7 天活躍次數；WebRTC 本地 IP／STUN（比對是否洩漏真實 IP）。
- DNS 洩漏狀態＋洩漏清單（結構化陣列）。
- 開放端口（結構化 array，避免只存字串）。
- 地理卡＋地圖按鈕；時區/時間一致性矩陣。

### ④ 硬體與設備指紋

- GPU：unmasked vendor/renderer（例如 Qualcomm / Adreno 613）。
- CPU 核心數、device memory、螢幕解析度/CSS viewport/色深/觸控、media devices。
- 指紋 hash 群：Canvas、WebGL、WebGL Report、WebGPU、Audio、Fonts、Client Rects。
- 此模組資料應可作為「跨 session 設備聚類」索引。

### ⑤ 瀏覽器與軟體環境

- OS／瀏覽器／版本／設備型號／無痕模式。
- UA Header vs JS UA（與真實平台比對）。
- 語言：language / accept-language / Intl API；字體 hash＋列表。
- 功能狀態：JS、Cookie、DNT、Flash/ActiveX/Java（現代瀏覽器皆 disabled 為正常）。

### ⑥ 原始資料抽屜

- 檢測協議版本、時間戳、完整 `raw_json`；提供「複製 JSON」。
- 預設收合，不干擾審核。

## 四、對應現有程式碼的落地方式

### 4.1 已具備（直接沿用）

- `packages/core-schema`：EnvironmentReport / NormalizedSignal（含 signals、raw）。
- `packages/browser-sdk`：ua/clientHints/canvas/webgl/webgpu/audio/screen/locale/timezone/webrtc。
- `/admin` 管理者工作台：`ModuleCategory` / `ModuleItem` 啟停、顯示、排序。
- API：tenant/API Key、reports、network 分析、policy、webhook、PostgreSQL。

### 4.2 待補（Gap）

| 缺口 | 來源 | 建議做法 |
|---|---|---|
| Port scan 結構化 | 三份方案 | 以 `string[]`/關聯表存 `open_ports`；22/3389 觸發高風險規則 |
| DNS 洩漏清單結構化 | 多份 | `dnsLeak: { status, list: string[] }` |
| IP 7 天活躍數 | Gemini/Qwen | repository 統計或 Redis 計數 |
| 字體指紋（Fonts） | 多份 | browser-sdk 新增 fontsModule（hash＋list） |
| Client Rects | Gemini | browser-sdk 新增 clientRectsModule |
| Media devices 授權狀態 | 多份 | browser-sdk 新增 mediaDevicesModule（僅狀態，不取流） |
| 原始 Payload 展開 | 多份 | 報告 raw JSON 已在；後台補 JSON viewer |
| 黑名單/白名單/封鎖 | Gemini | policy-engine 擴充 + API 端點 |
| 指紋跨 session 聚類 | 跨學科版 | repository 依 hash 查詢同一設備其他報告 |
| RBAC 遮罩 | Qwen/跨學科 | 管理 PIN 之後接角色權限 |

### 4.3 資料模型原則

- 維持 `EnvironmentReport` 作為單一事實來源（canonical JSONB），避免過度正規化。
- 另建三個「查詢用」層（可為 DB table 或 materialized view）：
  1. `risk_events`：扣分/警報事件（port、OS conflict、DNS leak），供列表與報表。
  2. `device_fingerprints`：hash 群＋device profile，供聚類與黑名單。
  3. `session_overview`：visitor/session/score/flags，供 0.5 秒決策列表。

## 五、規則引擎優先順序（定版建議）

1. **🚨 高**：`open_ports` 含 22 或 3389，且來源疑似行動裝置 → 疑似雲手機/伺服器模擬器。
2. **⚠️ 中**：UA 宣稱 OS ≠ 底層 Platform → 偽裝/抹機痕跡。
3. **ℹ️ 低（隱私）**：僅 Canvas 篡改、無其他矛盾 → 歸為隱私防禦，不封鎖。
4. **🟡 提示**：宣稱 VPN/代理但 DNS 洩漏 → 洩漏真實電信商。
5. **✅ 參考**：IP 7 天活躍數低、時區/語言一致、無 Bot → 加分證據。

## 六、納入管理者工作台的模組目錄（草案）

```ts
// 分類：overview 決策 / risk 異常 / network 網路地理 /
//       hardware 硬體 / browser 環境 / raw 原始資料
{ id: 'overview.verdict', kind: 'policy',    enabled: true, visible: true }
{ id: 'risk.conflicts',   kind: 'analysis',  enabled: true, visible: true }
{ id: 'network.geo',      kind: 'analysis',  enabled: true, visible: true }
{ id: 'hardware.fp',      kind: 'detection', enabled: true, visible: true }
{ id: 'browser.env',      kind: 'detection', enabled: true, visible: true }
{ id: 'raw.payload',      kind: 'output',    enabled: true, visible: false }
```

> 管理者可依此在 `/admin` 直接啟停／隱藏／排序，與本文件一致。
