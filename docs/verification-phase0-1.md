# Phase 0 / Phase 1 驗證指標檢核報告

> 日期：2026-08-28  
> 依據：[ShieldScan-0-1到商業化完整規劃.md](../ShieldScan-0-1到商業化完整規劃.md) Phase 0 / Phase 1 驗收標準

## Phase 0：資料契約與插件協議

| 驗收標準 | 狀態 | 證據 |
|---|---|---|
| `EnvironmentReport` / `NormalizedSignal` / `ScoreBundle` 定稿，所有端共用同一套型別 | ✅ 達標 | [core-schema](../packages/core-schema/src/index.ts) v0.1.0，型別由 zod schema 推導，`SCHEMA_VERSION` 版本化；`pnpm -r typecheck` 全數通過 |
| `PluginManifest` 規範與 CLI 驗證工具 | ✅ 達標 | [plugin-cli](../packages/plugin-cli/src/cli.ts) `shieldscan-plugin validate`：有效 manifest exit 0、無效 exit 1 且列出欄位錯誤；[範例 manifest](../plugins/detection/browser.canvas/manifest.json) 驗證通過 |
| Monorepo 骨架，`pnpm install && pnpm -r build` 通過 | ✅ 達標 | 本機實測 `pnpm install`、`pnpm -r typecheck`、`pnpm -r build`（含 Next.js production build）全數通過 |

**Phase 0 結論：達標，可進入 Phase 1。**

## Phase 1：Browser SDK MVP + 免費檢測網站

| 驗收標準 | 狀態 | 證據 |
|---|---|---|
| browser-sdk 第一批插件（canvas / webgl / webgpu / audio / screen / locale / timezone / webrtc） | ✅ 達標（10 個） | 另有 ua、clientHints，共 10 個模組；`ScanSession` 即時進度事件 + `buildReport()` |
| 單次採集 < 3 秒（P95） | ✅ 達標 | Playwright 實測 3 次掃描：2017 / 1209 / 1130 ms，P95 = 2017 ms |
| 檢測網站：一鍵掃描 + 分區報告 + JSON 匯出 | ✅ 程式完成（待部署） | [scanner.spec.ts](../apps/web-scanner/e2e/scanner.spec.ts) 全流程測試通過；`/`、`/privacy` HTTP 200 |
| 隱私政策與同意機制（local-only / standard / stored） | ✅ 達標 | [consent-banner.tsx](../apps/web-scanner/src/components/consent-banner.tsx) + [隱私政策頁](../apps/web-scanner/src/app/privacy/page.tsx)；E2E 驗證選擇持久化 |

## Phase 1 驗證指標（達標才進 Phase 2）

| 指標 | 目標 | 現況 | 判定 |
|---|---|---|---|
| 網站月掃描次數 | ≥ 5,000（自然流量） | 尚未部署，無自然流量 | ❌ 未達標（需部署 + SEO/GTM） |
| 掃描完成率 | ≥ 90% | E2E 中 10/10 模組完成（100%） | ✅ 技術面達標（真實使用者資料待上線後統計） |
| 報告分享率 | ≥ 5% | 尚未提供分享功能 | ❌ 未達標（分享功能屬後續版本） |

**Phase 1 結論：技術交付達標、可公開上線；但「商業驗證指標」尚未達標——需部署網站並累積自然流量後才能正式進入 Phase 2 的商業驗證循環。**

## E2E 測試狀態

```text
6 passed (13.7s)
├─ 首頁載入：標題、同意選項與掃描按鈕
├─ 同意模式選擇會持久化（localStorage）
├─ 完整掃描流程：進度列 → 分區報告 → 四維評分（完成率 ≥ 90% 斷言）
├─ 掃描耗時低於 3 秒（P95=2017ms）
├─ JSON 匯出：下載完整 EnvironmentReport
└─ 隱私政策頁：三種同意模式說明與返回連結
```

CI（[.github/workflows/ci.yml](../.github/workflows/ci.yml)）串接 typecheck → build → Playwright e2e，確保每次提交都通過。
