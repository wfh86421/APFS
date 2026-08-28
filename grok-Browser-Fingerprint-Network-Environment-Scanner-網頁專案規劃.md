# grok 的網頁專案規劃：Browser Fingerprint & Network Environment Scanner

類似 browserscan.net 的瀏覽器指紋與網路環境檢測工具。

## 目標

建立一個現代化、高隱私意識的網頁工具，即時收集、分析並視覺化呈現瀏覽器指紋、硬體資訊、網路環境、地理位置、異常檢測（如 Canvas 篡改、UA/OS 不一致、DNS 洩漏、開放端口等），並給出隱私評分與風險提示。以你提供的報告作為核心資料模型與展示範本。

## 1. 專案目標與核心功能

- 即時指紋採集：Canvas、WebGL、WebGPU、Audio、Fonts、ClientRects、Screen、Hardware Concurrency、Device Memory、Touch Support、Media Devices 等。
- 網路與環境檢測：IP、WebRTC、DNS 洩漏、Proxy/匿名性、時區一致性、Languages、Do Not Track、Bot Detection。
- 異常與風險分析：
  - Canvas Tampering（Brave 等隱私瀏覽器常見）
  - Operating System mismatch（UA 與實際 Platform 不一致）
  - DNS Leak
  - 異常開放端口（如 22/SSH、3389/RDP）
  - 隱私評分計算（扣分機制可配置）
- 視覺化報告：分區塊展示（Overview、Issues、IP、Location、Hardware、Browser、Software），支援匯出 PDF/JSON、分享、歷史記錄（可選登入）。
- 隱私優先：前端盡量本地計算，最小化後端追蹤；明確告知使用者資料用途。
- 額外加值：對比歷史指紋、模擬不同環境的差異提示、教育性質的「為什麼會扣分」說明。

## 2. 核心架構

採用前後端分離 + 輕量後端架構，強調前端計算優先（減少伺服器負擔與隱私風險）。

```text
┌─────────────────────────────────────────────────────────────┐
│                        Client (Browser)                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │ Fingerprint │  │ Network &    │  │ Analysis Engine    │ │
│  │ Collectors  │  │ WebRTC/DNS   │  │ (Score / Issues)   │ │
│  │ (Canvas,    │  │ Leak Detect  │  │                    │ │
│  │ WebGL...)   │  │              │  │                    │ │
│  └──────┬──────┘  └──────┬───────┘  └─────────┬──────────┘ │
│         │                │                    │            │
│         └────────────────┴────────────────────┘            │
│                          │                                  │
│                   State Management                          │
│                   (Report Object)                           │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS (JSON)
┌──────────────────────────▼──────────────────────────────────┐
│                     Backend API (Optional)                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │ IP / Geo    │  │ DNS / Proxy  │  │ Port Scan /        │ │
│  │ Lookup      │  │ Leak Check   │  │ Blacklist (optional)│ │
│  │ (MaxMind /  │  │              │  │                    │ │
│  │ ipinfo)     │  │              │  │                    │ │
│  └─────────────┘  └──────────────┘  └────────────────────┘ │
│                                                              │
│  Auth (optional) + Report Storage (Redis / Postgres)         │
└──────────────────────────────────────────────────────────────┘
```

### 資料流

1. 頁面載入 → 前端並行執行多個指紋採集腳本。
2. 本地組裝完整 Report Object（對應你提供的所有欄位）。
3. 需要外部服務的部分（真實 IP 地理位置、DNS 洩漏驗證、簡單端口探測）呼叫後端 API。
4. 前端計算隱私分數與 Issues 清單。
5. 渲染互動式報告頁面。

### 報告資料模型（核心）

直接對應你給的結構：

- Overview
- Issues（扣分項 + 說明）
- IP address
- Location
- Hardware（visitor ID、Canvas、WebGL、Audio…）
- Browser（UA、OS 衝突偵測）
- Software（時區、語言、端口、字體等）

## 3. 技術棧建議

### 前端

- 框架：Next.js 15 (App Router) + React 19
  - SSR/SSG 混合、優秀 SEO、邊緣部署友善
- 語言：TypeScript（嚴格型別，報告物件用 Zod 驗證）
- 狀態管理：Zustand 或 React Context + useReducer（報告資料相對單純）
- UI：Tailwind CSS + shadcn/ui + Framer Motion（現代化、響應式、動畫過渡）
- 指紋核心函式庫：
  - @fingerprintjs/fingerprintjs（或自寫輕量版，避免過度依賴）
  - 自製 Canvas / WebGL / Audio 雜湊
  - webrtc-adapter + 自寫 STUN 檢測
- 地圖：Leaflet 或 Mapbox（顯示經緯度）
- 圖表 / 視覺化：Recharts 或自寫進度條與雷達圖（隱私分數）
- 匯出：html2canvas + jsPDF 或純 JSON 下載

### 後端（可選但建議有）

- 執行環境：Node.js 22 + Fastify 或 Hono（輕量高速）
- 部署：Vercel / Cloudflare Workers（邊緣）+ 傳統 VPS（需要端口掃描時）
- IP / Geo：MaxMind GeoIP2 或 ipinfo.io / ipapi.co
- DNS 洩漏檢測：簡單 DNS over HTTPS 查詢 + 比對
- 端口掃描：僅限安全、非侵入式（或完全前端提示「異常端口由後端輔助」）
- 資料庫（可選）：PostgreSQL（歷史報告）+ Redis（快取）
- 認證：NextAuth.js / Clerk（若要「Sign In 查看詳情」）

### 基礎設施與工具

- 套件管理：pnpm
- 程式碼品質：ESLint + Prettier + Husky
- 測試：Vitest + Playwright（關鍵指紋一致性測試）
- 監控：Sentry（前端錯誤）
- 部署：Vercel（前端）+ Railway / Fly.io（後端）

## 4. 關鍵實作注意事項（對應報告中的異常）

- Canvas Tampering：明確標記為「Brave / 隱私瀏覽器正常行為」，不要過度扣分。
- OS 不一致：比對 navigator.userAgent vs navigator.platform / navigator.userAgentData，並給出清楚說明。
- 端口 22 / 3389：手機環境極不尋常 → 強烈提示可能是模擬器、路由器 port forward 或伺服器環境。
- DNS Leak：同時顯示多個 DNS 伺服器並標註 ISP。
- 隱私評分算法：可配置權重（Canvas -5、OS mismatch -5、DNS leak -10、異常端口 -15 等）。

## 5. 開發階段建議

- MVP：純前端指紋採集 + 基本報告頁面 + 本地評分。
- V1：加入後端 IP/Geo/DNS 服務 + 完整 Issues 分析。
- V2：使用者帳號、歷史比對、PDF 匯出、多語言（優先繁中）。
- 進階：模擬不同 UA/環境的差異測試工具、API 提供給其他開發者。

## 6. 隱私與合規

- 明確隱私政策：資料僅用於當次分析，預設不儲存。
- 可選「完全本地模式」（不呼叫任何後端）。
- 遵守 GDPR / 台灣個資法精神。

這份架構直接以你提供的 browserscan.net 報告作為資料模型與功能基準，可快速落地成一個功能完整、現代且注重隱私的指紋檢測網站。

## 後續可輸出項目

- 詳細資料結構（TypeScript interface）
- 前端指紋採集核心程式碼骨架
- 隱私評分演算法範例
- 專案目錄結構與 package.json
