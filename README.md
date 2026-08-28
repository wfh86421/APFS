# ShieldScan（隱盾檢測）

瀏覽器指紋與網路環境安全檢測平台 — **環境可信度基礎設施**。

## 定位

前台是免費/半免費的瀏覽器指紋檢測工具，後台沉澱匿名化、合規化、可驗證的真實環境資料，最終對外提供 SDK、API、風險評分、反詐欺、反自動化、裝置可信度、環境一致性驗證等能力。

- **網站是入口**：免費檢測網站負責吸引使用者、建立信任、沉澱資料。
- **插件化 Kernel 是骨架**：檢測模組、評分規則、輸出渠道全部可插拔。
- **L0–L5 跨層一致性是判斷力**：伺服器端網路指紋（JA4/TCP）為信任錨點，與客戶端硬體/瀏覽器/行為訊號交叉驗證。
- **SDK/API 是商業化管道**：任何軟體、網站、App、插件、API 服務都能串接。
- **真實環境資料庫是最終不可替代的資產**。

## Monorepo 結構

```text
apps/          應用層：web-scanner、developer-portal、dashboard、streaming-demo、api
packages/      共享套件：core-schema、plugin-runtime、scoring-engine、policy-engine、browser-sdk、react-sdk、node-sdk
mobile/        行動端 SDK：android-sdk、ios-sdk
plugins/       可插拔檢測/分析/評分/政策/輸出插件
services/      獨立服務：ingestion-api、scanner-service、dns-stun-service、reputation-service
infra/         基礎設施：Docker、監控、IaC
docs/          技術文件
```

## 規劃文件

本儲存庫根目錄同時存放各來源 AI 的規劃文件與最優合併方案：

- [ShieldScan-0-1到商業化完整規劃.md](./ShieldScan-0-1到商業化完整規劃.md) — 0-1 到商業化完整路徑（本專案行動綱領）
- [ShieldScan-最優合併方案規劃書.md](./ShieldScan-最優合併方案規劃書.md) — 最優合併方案（本專案總綱）
- [瀏覽器指紋檢測平台-合併最優解與商業化護城河規劃.md](./瀏覽器指紋檢測平台-合併最優解與商業化護城河規劃.md)
- [瀏覽器指紋檢測平台-0-1插件化核心平台架構規劃.md](./瀏覽器指紋檢測平台-0-1插件化核心平台架構規劃.md)
- [kimi 瀏覽器指紋檢測平台-0-1插件化核心平台架構規劃.md](./kimi 瀏覽器指紋檢測平台-0-1插件化核心平台架構規劃.md)
- [kimi.ShieldScan_Architecture_Plan.md](./kimi.ShieldScan_Architecture_Plan.md)
- [DeepSeek-瀏覽器指紋檢測平台規劃.md](./DeepSeek-瀏覽器指紋檢測平台規劃.md)
- [grok-Browser-Fingerprint-Network-Environment-Scanner-網頁專案規劃.md](./grok-Browser-Fingerprint-Network-Environment-Scanner-網頁專案規劃.md)
- [瀏覽器指紋檢測平台-網頁專案計畫與技術架構 Qwen3.8-Max.txt](./瀏覽器指紋檢測平台-網頁專案計畫與技術架構 Qwen3.8-Max.txt)

## 開發

```bash
pnpm install
pnpm --filter @shieldscan/core-schema build
pnpm --filter @shieldscan/browser-sdk build
pnpm --filter @shieldscan/web-scanner dev
```

Node.js >= 22，套件管理使用 pnpm workspace。
