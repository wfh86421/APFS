# 瀏覽器指紋檢測平台 — 最優合併方案規劃書

> **版本**：v1.0  
> **日期**：2026-08-28  
> **定位**：環境可信度基礎設施（一切皆插件 + 跨層一致性驗證 + 資料護城河）  
> **整合來源**：Qwen3.8-Max、grok、DeepSeek、合併最優解與商業化護城河規劃、0-1 插件化核心平台架構規劃、kimi 0-1 插件化核心平台架構規劃、kimi ShieldScan Architecture Plan v1.0

---

## 一句話定位

這個專案不應該只做成「類 browserscan.net 的檢測頁面」，而應該做成一個以瀏覽器、設備、網路環境真實訊號為核心的「環境真實性基礎設施平台」。

前台是免費/半免費的瀏覽器指紋檢測工具，後台沉澱匿名化、合規化、可驗證的真實環境資料，最終對外提供 SDK、API、風險評分、反詐欺、反自動化、裝置可信度、環境一致性驗證等能力，讓任何軟體、網站、App、插件、API 服務都能串接這個平台。

```
網站是入口
插件化 Kernel 是骨架
L0–L5 跨層一致性是判斷力
SDK/API 是商業化管道
真實環境資料庫是最終不可替代的資產
```

---

## 一、核心判斷

真正的護城河不是「能不能檢測 Canvas、WebGL、IP、DNS」——單項技術可以被複製。真正難以替代的是：

1. 長期累積的真實環境資料庫。
2. 跨瀏覽器、跨設備、跨 IP、跨網路的可信基準線。
3. 能判斷「正常隱私保護」與「惡意偽裝/自動化環境」差異的分析模型。
4. 可被第三方系統低成本接入的 SDK/API。
5. 合規、透明、可審計的資料治理與風險評分邏輯。
6. 跨層一致性驗證的能力：知道「哪些訊號必須交叉比對」的知識與模式庫。

---

## 二、最優產品架構（六層）

### 1. 統一資料契約層（優先級：最高）

所有平台、插件、SDK 回傳同一份 `EnvironmentReport`。這是地基，也是最大護城河的起點。

- 沒有資料契約，網站、SDK、API、資料庫各做各的，資料散掉。
- 每次掃描都產生可比較的特徵，不只產生展示文字。
- 資料越多，越能建立正常基準線與異常樣本庫。
- 後續 API、SDK、企業版、模型評分都依賴這層。

核心資料範圍：

- Browser：UA、Client Hints、平台、版本、語言、時區、Cookie、DNT。
- Hardware：Canvas、WebGL、WebGPU、Audio、Fonts、ClientRects、Screen、CPU、Memory、Touch。
- Network：IP、ASN、ISP、GeoIP、WebRTC、STUN、DNS resolver、Proxy/VPN/Tor/Hosting 判斷。
- Security：開放端口、黑名單、DNS leak、IP reputation、Bot signals。
- Consistency：UA/OS 不一致、IP/時區不一致、語言/地理不一致、GPU/設備型號不一致、WebGPU/WebGL 不一致。
- Score：隱私暴露分數、真實性分數、自動化風險分數、網路信任分數。

### 2. 插件化核心平台（Kernel）

核心平台不直接知道「Canvas 怎麼檢測」或「Android 雙開怎麼判斷」。核心只知道：

- 有哪些插件、插件在哪些平台可用、需要什麼權限。
- 插件輸入輸出格式、版本、是否可信。
- 插件結果如何合併到報告。
- 哪些租戶可使用哪些插件、哪些規則套用到哪些場景、結果輸出到哪裡。

Kernel 模組：

| 模組 | 職責 |
|---|---|
| Event Bus | 所有跨模組通訊的唯一通道（`detection.**`、`scoring.completed`、`output.*`） |
| Plugin Loader / Registry | 插件清單、版本、依賴解析、熱更新、簽名校驗 |
| Config Center | 多層級配置（default < file < env < runtime < plugin） |
| Lifecycle Manager | 啟動順序、健康檢查、優雅關閉、熔斷 |
| Scheduler | 定時任務、延遲隊列、任務分片 |
| Sandbox | 資源隔離、權限控制、超時熔斷 |
| Trust & Signature Verifier | 驗證 SDK 簽名、時間戳、nonce、上報完整性 |
| Report Normalizer | 將不同端回傳的訊號轉成標準報告格式 |
| Policy Engine | 依客戶場景做 allow / review / challenge / block |
| Data Governance | 匿名化、保留期限、刪除請求、審計 |
| Tenant System | 客戶、API key、配額、計費、權限 |

### 3. 分層訊號採集與跨層一致性驗證

訊號分六層採集，偽造難度差異巨大。**L0/L1 無法從瀏覽器偽造，是信任錨點；L2–L5 用於識別與交叉驗證；跨層不一致本身就是高風險訊號。**

| 層級 | 採集位置 | 訊號類型 | 偽造難度 | 關鍵技術 |
|---|---|---|---|---|
| L0 | Server-side（反向代理/WAF） | TLS JA4/JA3、HTTP/2 SETTINGS、TCP/IP 特徵 | 極難 | JA4 指紋、TCP 指紋 |
| L1 | Server-side + Client | IP 地理位置、WebRTC、DNS 洩漏、端口掃描 | 很難 | STUN/TURN、端口探測 |
| L2 | Client-side（JS） | Canvas、WebGL、WebGPU、Audio、GPU 資訊 | 中等 | WebGPU Adapter Info、Shader Timing |
| L3 | Client-side（JS） | User-Agent、Platform、語言、時區、字體 | 容易 | Client Hints、Intl API |
| L4 | Client-side（JS） | 滑鼠軌跡、鍵盤節奏、頁面停留、滾動模式 | 中等 | 行為生物特徵 |
| L5 | Client-side（JS） | 插件列表、Cookie 狀態、Flash/Java、DNT | 非常容易 | Navigator API |

### 4. 分析與評分引擎

捨棄單一隱私分數，改為四種分數：

- Privacy Exposure Score：使用者暴露給網站的程度。
- Authenticity Score：環境是否像真實自然使用者。
- Automation Risk Score：是否像 Bot、自動化、模擬器、指紋瀏覽器。
- Network Trust Score：IP、DNS、ASN、Proxy、Hosting、黑名單與端口風險。

企業客戶真正買的是「可決策的風險訊號」。不同產業可配置不同權重：

- 金融/支付：重視偽裝與代理、自動化、模擬器/Root/越獄。
- 看劇平台/內容平台：重視帳號共享、地區限制繞過、WebView/播放器異常、批量播放。
- 遊戲/任務平台：重視模擬器、多開、Hook/Frida/Xposed、多帳號批量行為。
- 資安：重視端口、DNS 洩漏、IP 信譽。

### 5. 多平台協同 SDK

不要只把採集邏輯寫死在網站前端，應拆成可版本化、可嵌入、可授權的多端 SDK：

- `@platform/browser-sdk`：瀏覽器端 JS/TS SDK（framework-agnostic）。
- `@platform/react`：React Hook 與元件包。
- `@platform/node`：Node.js 後端驗證 SDK。
- `platform-android-sdk`：Android 原生 SDK（Root、Magisk/Xposed/Frida、模擬器、雙開空間、VPN/Proxy、App 簽名）。
- `platform-ios-sdk`：iOS 原生 SDK（DeviceCheck、App Attest、越獄跡象）。
- `platform-webview-sdk`：App 內嵌 WebView/Hybrid App SDK（Native + WebView + Server 三方一致性）。
- REST API + Webhook：讓非 JS 系統也能接。
- 未來可擴充：Electron、Chrome extension、Cloudflare Worker middleware、Nginx/OpenResty module。

### 6. 商業化表層

| 表面 | 角色 |
|---|---|
| 免費檢測網站 | 資料入口、信任入口、SEO 入口、開發者入口 |
| API / SDK 計費 | 商業化主體，可規模化、可嵌入客戶核心流程 |
| 企業 SaaS Dashboard | 可視化、查詢、告警、審計、團隊管理、SLA |
| 資料產品 | IP/指紋信譽 feed、基準庫、威脅情報（資料量起來後） |
| 私有化部署 + 顧問服務 | 高客單價，適合金融、遊戲、交易所、廣告科技 |

---

## 三、插件化核心平台設計

### 插件分類（五類）

1. **Detection Plugin**：採集原始訊號。例：`browser.canvas`、`network.dnsLeak`、`mobile.android.cloneSpace`、`content.streaming.accountSharing`。
2. **Analysis Plugin**：把多個原始訊號組合成判斷。例：`analysis.osMismatch`、`analysis.proxyVpnTor`、`analysis.webNativeMismatch`。
3. **Scoring Plugin**：產生分數。例：`score.privacyExposure`、`score.automationRisk`、`score.streamingAbuse`。
4. **Policy Plugin**：把分數轉成商業決策（allow / review / challenge / limit / block / log_only）。例：`policy.loginRisk`、`policy.streamingPlaybackRisk`。
5. **Output Plugin**：結果輸出。例：`output.apiJson`、`output.webhook`、`output.dashboard`、`output.pdf`、`output.siem`、`output.slack`。

### Plugin Manifest

```ts
export interface PluginManifest {
  id: string;
  name: string;
  version: string;                      // plugin-id@major.minor.patch
  type: 'detection' | 'analysis' | 'scoring' | 'policy' | 'output';
  platforms: Platform[];                // browser | android | ios | webview | node | edge | server
  capabilities: string[];
  requiredPermissions: string[];
  inputSchema: string;
  outputSchema: string;
  riskLevel: 'low' | 'medium' | 'high';
  defaultEnabled: boolean;
  resources?: {                         // 沙箱資源上限
    maxMemoryMB: number;
    maxExecutionTimeMs: number;
    cpuQuota: number;
  };
}
```

### 熱插拔機制

- 插件由設定控制，不寫死在程式碼流程中。
- 支援全量啟用、指定租戶啟用、指定百分比流量啟用、指定平台啟用、版本鎖定、快速 rollback。
- 資料入庫必須記錄插件版本，否則未來無法回溯「某個分數是由哪版規則算出來的」。

```ts
export interface PluginProfile {
  profileId: string;
  tenantId: string;
  scenario: 'scanner' | 'login' | 'payment' | 'streaming' | 'game' | 'custom';
  enabledPlugins: string[];
  disabledPlugins: string[];
  scoringProfile: string;
  outputProfile: string;
}
```

---

## 四、統一資料契約

```ts
export interface EnvironmentReport {
  reportId: string;
  tenantId?: string;
  sessionId: string;
  subjectId?: string;
  source: ReportSource;                  // web | android | ios | webview | node | api
  createdAt: string;
  consent: ConsentState;                 // local-only | standard | stored
  sdk: SdkInfo;
  signals: NormalizedSignal[];
  issues: AnalysisIssue[];
  scores: ScoreBundle;
  policy?: PolicyDecision;
  outputs?: OutputResult[];
  integrity: ReportIntegrity;            // 簽名、nonce、timestamp
}

export interface NormalizedSignal {
  id: string;
  pluginId: string;
  pluginVersion: string;
  platform: Platform;
  category: 'browser' | 'hardware' | 'network' | 'security' | 'mobile' | 'app' | 'content';
  key: string;
  value: unknown;
  hash?: string;
  confidence: number;
  collectedAt: string;
}

export interface ScoreBundle {
  privacyExposure: number;
  authenticity: number;
  automationRisk: number;
  networkTrust: number;
  mobileIntegrity?: number;
  contentAbuseRisk?: number;
  custom?: Record<string, number>;
}
```

---

## 五、技術棧最優解

### 前端

| 技術 | 選型 | 理由 |
|---|---|---|
| 框架 | Next.js 15 (App Router) + React 19 | 檢測網站、文件、SEO、API 文件與商業頁同一框架；對 SDK/企業 dashboard 生態最友善 |
| 語言 | TypeScript 5.x | 複雜指紋資料模型需要型別安全 |
| 樣式 | Tailwind CSS 4 + shadcn/ui | 現代化、可客製 |
| 狀態 | Zustand + TanStack Query | 輕量、非同步狀態管理優秀 |
| 圖表 | Recharts + D3.js | 評分儀表盤、一致性熱力圖、指紋 DNA 雷達圖 |
| 國際化 | next-intl | zh-TW / en-US / ja 等多語 |
| 測試 | Vitest + Playwright | 跨瀏覽器採集一致性驗證 |

### 採集 SDK

- 自研 framework-agnostic 採集核心（參考 FingerprintJS/ThumbmarkJS/CreepJS 思路，不依賴第三方作為主體）。
- 分模組採集：Canvas、WebGL、WebGPU、Audio、Fonts、ClientRects、Screen、Media、Permissions、Battery、Network Information、Client Hints。
- **WebGPU 深度指紋是 2026 年的差異點**：Adapter Info、60+ limits、Feature Flags、Preferred Canvas Format、Shader 編譯計時、Compute benchmark（熵值 30+ bits，無法被淺層 JS 補丁偽造）。
- WebRTC/STUN 使用多節點輪詢。

### 後端 API

| 技術 | 選型 | 理由 |
|---|---|---|
| API 主服務 | Node.js 22 + Fastify 或 Hono | TypeScript 前後端共用型別；輕量、API-first |
| ML / 網路指紋分析 | Python 3.12 + FastAPI + Celery（獨立服務） | ja4 生態、scikit-learn/XGBoost/PyTorch、ML 特徵工程 |
| 即時服務 | Node.js + Socket.io / SSE（獨立服務） | DNS leak、端口檢測的長任務即時進度 |
| API 規格 | OpenAPI 自動生成 SDK | 客戶接入成本最低 |

### 網路檢測與掃描服務

- 獨立 Go/Rust 或 Python Scanner Service，不塞進主 API。
- 僅允許掃描使用者自身來源 IP，限流、審計、明示用途。
- DNS leak 使用自有可觀測域名 + 多區域 DNS/STUN 節點。
- L0 網路指紋：JA4/JA3、HTTP/2 SETTINGS、TCP/IP 特徵（Server-side，不可被客戶端偽造）。

### 資料層

| 元件 | 用途 |
|---|---|
| PostgreSQL 16 | 報告、帳號、API key、計費、插件與評分規則配置 |
| Redis 7 | 快取、Rate Limit、Session、短期任務隊列 |
| ClickHouse / TimescaleDB | 大量時間序列與事件分析、趨勢查詢 |
| Milvus（向量 DB） | 指紋特徵向量相似度搜索（跨設備、跨 IP 關聯） |
| MinIO / S3 | 原始匿名化報告、PDF、模型檔案 |
| Meilisearch / OpenSearch | 報告搜尋與企業 dashboard 查詢 |

原始資料、標準化資料、特徵資料要分層保存，方便合規刪除與模型訓練。

### 基礎設施

- Cloudflare：CDN、DDoS、WAF、DNS。
- Vercel / Cloudflare Pages：前端。
- Fly.io / Railway / VPS：API 與 scanner service。
- Docker + GitHub Actions；生產再評估 Kubernetes。
- Traefik：反向代理、自動 Let's Encrypt。
- Prometheus + Grafana + Loki + Alertmanager + Sentry + OpenTelemetry。

---

## 六、評分引擎設計

### 三軌合併

```text
最終分數 = 規則引擎評分（可解釋、可配置）
        + 跨層一致性驗證（偵測偽造與欺騙）
        + ML 異常檢測（識別人類難以察覺的模式）
        → 加權聚合 → 四種分數 + grade + deductions + risk_flags
```

### 跨層一致性檢查清單（核心差異點）

1. UA 宣稱的 OS 與 Platform API 是否一致（如 Android 10 vs Android 14）。
2. GPU 型號（WebGPU/WebGL）與宣稱設備型號是否匹配。
3. IP 地理位置時區與 JS 時區是否一致。
4. WebGPU 與 WebGL 回報的 GPU 資訊是否一致。
5. 端口開放異常（手機網路出現 22/3389/445）。
6. Native SDK、WebView SDK、後端 HTTP headers 三方一致性（App 場景）。
7. 語言三來源一致性：`navigator.language` vs `Accept-Language` vs Intl API。

### 評分 Profile 範例（看劇平台）

```json
{
  "profile": "streaming-default",
  "weights": {
    "network.proxyVpn": 20,
    "content.accountSharing": 25,
    "app.webviewMismatch": 15,
    "automation.runtime": 15,
    "geo.regionMismatch": 10,
    "device.multiAccountCluster": 15
  },
  "thresholds": {
    "allow": 30,
    "review": 60,
    "challenge": 75,
    "block": 90
  }
}
```

### 預設評分規則（參考用戶報告數據）

| 規則 | 觸發條件 | 預設扣分 | 嚴重度 |
|---|---|---|---|
| Canvas 篡改 | Canvas API 被修改（Brave 等屬正常） | -5 | info |
| OS 不一致 | UA OS ≠ Platform OS | -5 | warning |
| DNS 洩漏 | 偵測到多個 DNS / 真實 ISP DNS | -10 | warning |
| WebRTC 洩漏 | 洩漏本地 IP | -8 | warning |
| 代理偵測 | 偵測到代理 | -15 | critical |
| VPN 偵測 | 偵測到 VPN | -10 | warning |
| Tor 出口 | IP 在 Tor 出口列表 | -20 | critical |
| 異常端口（22/3389） | 手機網路出現 SSH/RDP | -15 | critical |
| Bot 偵測 | 置信度 > 0.7 | -20 | critical |
| 黑名單 IP | IP 在黑名單庫 | -25 | critical |
| 時區不一致 | IP 時區 ≠ JS 時區 | -5 | warning |
| 數據中心 IP | IP 來自 VPS/伺服器/代理 | -5 | info |

---

## 七、不可替代因素（護城河）

### 1. 跨層一致性驗證引擎 + 不一致模式庫

需要同時掌握 Server-side 網路指紋（JA4/TCP）與 Client-side 硬體指紋（WebGPU/WebGL）的專業知識，並建立龐大的不一致性模式庫。這是「知道該交叉比對什麼」的知識門檻，不是抄程式碼能解決的。

### 2. 長期累積的真實環境資料庫與基準線

- 正常樣本庫：真實 Brave、Chrome、Safari、Firefox、Android、iOS、Windows、macOS 在不同版本下的自然訊號。
- 異常樣本庫：模擬器、指紋瀏覽器、自動化瀏覽器、VPN、Proxy、Hosting ASN、DNS leak、端口異常。
- 行動端異常樣本庫：Root、Jailbreak、模擬器、雙開空間、Hook、重打包、WebView 偽裝。
- 資料網路效應：資料越多模型越準，競品越難追上。

### 3. WebGPU 深度指紋 + GPU 型號基準庫

30+ bits 熵值、Shader 編譯計時、Compute benchmark 無法被淺層 JS 補丁偽造。前提是掌握各 GPU 型號的基準行為。2026 年視窗期內仍算「深」的客戶端訊號，晚了要花更多時間補資料。

### 4. 行動端 Native + WebView + Server 三方一致性

雙開空間、模擬器、Root/Jailbreak、Hook、重打包是 Web 方案永遠碰不到的痛點，也是看劇平台、金融、遊戲、任務平台願意付費的真實場景。一旦形成 App 客戶基礎，替換成本極高。

### 5. ML 驅動的異常檢測

基於大規模指紋資料訓練的異常檢測模型，需要持續累積的標註資料與特徵工程經驗。資料護城河隨時間增長。

### 6. 插件化架構 + 合規可信度

「一切皆插件」必須從第一天規劃，後期重構成本極高，是結構性的不可替代。匿名化、可刪除、可審計、可解釋的資料治理是企業客戶願意把風險決策交給你的前提。

### 7. 台灣/亞太地區優化

台灣固網、中華電信等 ISP 特徵庫、區域 DNS 伺服器指紋庫、本地化 IP 定位資料庫。國際競品通常不會深耕，卻正是本地場景（新北市、台灣固網）最需要的部分。

---

## 八、執行路線圖

### Phase 0：資料契約與插件協議地基（1–2 週）

- 完成 `EnvironmentReport`、`NormalizedSignal`、`AnalysisIssue`、`ScoreBundle`、`PluginManifest`。
- 先固定資料契約，後面網站、SDK、API、資料庫才不會各做各的。

### Phase 1：Browser SDK MVP + 免費檢測網站（3–5 週）

- 第一批插件：`browser.ua`、`browser.clientHints`、`browser.canvas`、`browser.webgl`、`browser.webgpu`、`browser.audio`、`browser.screen`、`browser.locale`、`browser.timezone`、`browser.webrtc`。
- 基本報告頁、本地評分、JSON 匯出、隱私聲明。
- 開始累積第一批真實資料。

### Phase 2：後端與網路環境檢測（4–6 週）

- IP/Geo/ASN/ISP、JA4/TCP 指紋、WebRTC/STUN、DNS leak、安全限制下的端口檢測。
- 報告儲存與歷史比對。
- 這是與一般前端指紋 demo 拉開差距的階段。

### Phase 3：API 與 SDK 商業化 Beta（4–6 週）

- API key、Rate limit、Tenant。
- `POST /v1/reports`、`POST /v1/analyze`。
- Browser SDK npm package、React/Node demo、Webhook 風險通知、初版定價頁。

### Phase 3.5：行動端與 WebView SDK（4–8 週）

- Android SDK alpha、iOS SDK alpha、WebView bridge。
- Root/Jailbreak/模擬器/雙開空間/Hook/Proxy/VPN 基礎偵測。
- Native + WebView + Server 三方一致性分析。
- 看劇平台播放前檢查 demo、登入風控 demo。

### Phase 4：企業 Dashboard 與風險模型（持續）

- 多專案 dashboard、事件查詢、指紋歷史、IP reputation、風險趨勢。
- 權重可配置評分、客戶場景模板。
- ML 異常模型（XGBoost / Isolation Forest）、Milvus 指紋相似度搜索。

### Phase 5：資料護城河與生態（長期）

- 匿名化基準庫、區域/瀏覽器/設備/ASN 風險基準。
- IP/指紋信譽 data feed、私有化部署、合作夥伴 API。
- 研究報告與產業白皮書。

---

## 九、風險與邊界

### 法務與合規

- 必須明確告知資料用途，預設匿名化。
- 支援資料刪除請求（被遺忘權）、資料可攜性（JSON 匯出）。
- 端口檢測必須 opt-in，且只檢測使用者自身來源 IP、限流、審計。
- 行動端深層檢測要避免越權與暗中收集。
- 遵循 GDPR / CCPA / 台灣個資法精神。

### 技術風險

- 瀏覽器 API 會變動（WebGPU 標準仍在演進）。
- iOS 可採集訊號有限，可信度應放在 Apple 官方 attestation 與行為一致性。
- 指紋瀏覽器會持續對抗。
- SDK 被逆向是必然，要以 server challenge、簽名、nonce、時間戳、行為一致性降低風險。

### 商業風險

- 初期資料量不足，不能過早宣稱精準風險資料庫。
- 企業客戶需要可解釋性，不能只給黑盒分數。
- 不同產業權重不同，必須靠 scoring profile 解決。
- 不要早期上過重微服務或 Kubernetes；先用 modular monolith + isolated scanner service。

---

## 十、與各來源文件的取捨

| 來源 | 採用 | 修正或不採用 |
|---|---|---|
| Qwen3.8-Max | 8 大檢測模組、PostgreSQL/Redis/GeoIP/黑名單/Bot detection、Phase roadmap 與 KPI、Go scanner 方向 | 採集邏輯應拆成 framework-agnostic SDK，而非寫死在網站前端 |
| grok | 隱私優先、前端本地計算、完全本地模式、教育性風險解釋、PDF/JSON/分享/歷史比對 | 後端是「可選」會限制商業化；本地模式只是 consent 的一種 mode，不是產品定位 |
| DeepSeek | API 設計方向、報告資料表方向、部署與安全合規、階段化交付 | 否決 Vue 3 綁定；否決早期 Kubernetes；端口掃描不能當普通功能 |
| 合併最優解 | 定位升級、7 層產品架構、四種分數、商業模式排序、資料護城河 | 缺少 L0–L5 分層訊號模型與 WebGPU/JA4 深度指紋 |
| 0-1 插件化 | 五類插件、PluginManifest、統一 EnvironmentReport、熱插拔與灰度 | 缺少沙箱資源上限與事件總線的具體設計 |
| kimi 0-1 插件化 | Kernel 六模組、17 檢測插件清單、15 評分規則、12 輸出渠道、SDK 能力矩陣、8 週 roadmap | 以 Kernel 為中心但未把 L0/L1 伺服器端訊號提升為信任錨點 |
| ShieldScan v1.0 | L0–L5 訊號分層、JA4/WebGPU 深度指紋、跨層一致性驗證、ML + 向量 DB、不可替代要素 | API 主服務用 FastAPI 會與前端型別共用割裂，改為 Fastify 為主 + 獨立 Python ML/網路分析服務 |

---

## 十一、最終結論

0-1 最正確的做法是：

```text
先做資料契約與插件協議，再做第一批插件。
先做 SDK/API 閉環，再做企業 Dashboard。
先讓 Web 跑起來，再把 Android/iOS/WebView 接進來。
```

短期它是一個瀏覽器指紋檢測網站；中期它是 SDK/API 風控平台；長期它是跨端真實環境資料與風險判斷的商業基礎設施。前台負責吸引用戶與建立信任，SDK/API 負責商業化，資料平台負責護城河。Web 端是第一個入口，Android/iOS/雙開空間/WebView/看劇平台則是把護城河拓寬到真實商業場景的第二增長曲線。

---

## 附錄 A：最小可行資料契約（完整）

```ts
export interface EnvironmentReport {
  reportId: string;
  tenantId?: string;
  sessionId: string;
  subjectId?: string;
  source: ReportSource;
  createdAt: string;
  consent: {
    mode: 'local-only' | 'standard' | 'stored';
    retentionDays?: number;
  };
  sdk: {
    name: string;
    version: string;
    platform: Platform;
  };
  browser: BrowserSignals;
  hardware: HardwareSignals;
  network: NetworkSignals;
  security: SecuritySignals;
  consistency: ConsistencyIssue[];
  scores: {
    privacyExposure: number;
    authenticity: number;
    automationRisk: number;
    networkTrust: number;
  };
  integrity: {
    signature: string;
    nonce: string;
    timestamp: string;
  };
  raw?: unknown;
}
```

## 附錄 B：第一批插件清單排序

| 批次 | 插件 | 目的 |
|---|---|---|
| 第一批：Web 快速閉環 | ua、clientHints、canvas、webgl、webgpu、audio、screen、locale、timezone、webrtc | 最快做出可展示結果，累積第一批資料 |
| 第二批：Network 商業價值 | ipGeo、asnIsp、ja4Tcp、proxyVpn、dnsLeak、ipReputation、portProbe | 直接提升企業風控價值 |
| 第三批：Mobile 護城河 | android.emulator、android.root、android.cloneSpace、android.hook、android.appSignature、ios.jailbreak、ios.appAttest、webview.consistency | 大幅提高替代門檻 |
| 第四批：場景化插件 | streaming.accountSharing、streaming.geoBypass、streaming.playerIntegrity、policy.paymentRisk、policy.gameAntiCheat | 對應客戶痛點，最容易定價 |

---

> 本文件為最優合併方案規劃書，所有技術選型與數值均為初始設計，實際開發中應根據性能測試、安全審計與市場回饋進行調整。
