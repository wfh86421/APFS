# ShieldScan 驗證指標 — 可追蹤清單

> 更新：2026-09-07（P0 現況抽查：docs/reviews/2026-09-07-current-head-spotcheck.md）
> 使用方式：每週更新「狀態／證據」，達標才讓對應里程碑往下一階段移動。
> 圖例：✅ 達標｜🟡 進行中（技術可用、需量化驗證）｜⬜ 未開始

## A. 里程碑關卡（M1–M8）

| 里程碑 | 判定標準 | 狀態 | 目前證據／下一步 |
|---|---|---:|---|
| M1 網站上線 | 月掃描 ≥ 5,000 | 🟡 網站已上線 | 已有掃描頁；需統計月掃描數並接 GA/自建計數 |
| M2 網路層上線 | 網路層準確率 ≥ 95% | 🟡 架構/API 已上 | 目前 provider=mock；需 ip-api 真實樣本驗證 |
| M3 API Beta | ≥10 試用＋3 Pilot | 🟡 開發者自助註冊可用 | 需招募並記錄 tenant 試用數 |
| M4 第一個付費客戶 | 收入 >0 且連續付費 30 天 | ⬜ | 需上線計費/發票並成交 |
| M5 行動端 Demo | 1 個場景付費 Pilot | ⬜ | mobile 僅 README |
| M6 MRR ≥ NT$10 萬 | 可重複銷售流程 | ⬜ | 商業驗證階段 |
| M7 資料產品 | 基準庫/信譽 feed 上線 | ⬜ | 商業化後期 |
| M8 生態 | 合作夥伴 ≥3、插件市場 | ⬜ | 平台化後期 |

## B. 技術指標

| 指標 | 目標 | 狀態 | 驗證方式 |
|---|---:|---:|---|
| 單次完整掃描 | <3 秒（P95） | 🟡 | 效能測試頁／真實瀏覽器樣本 |
| API 回應 | <500ms（P99） | 🟡 | load test（k6/自建） |
| OS 不一致偵測準確率 | >95% | 🟡 | 測試樣本集 |
| WebRTC/DNS 洩漏偵測率 | >99% | 🟡 | 已知洩漏樣本 |
| 模型 AUC（異常偵測） | ≥0.85 | ⬜ | Phase4 ML 尚未開始 |
| 必要欄位缺失率 | <1% | ⬜ | 對報告欄位做統計 job |
| 高風險事件有證據鏈 | 100% | 🟡 | RiskEvent evidenceJson 已結構化；需計量覆蓋 |
| 敏感欄位存取有日誌 | 100% | 🟡 | audit_logs 已含 tenant_id 並逐「寫入/決策」端點記錄（init.sql:95；server.ts keys/report-delete/visitor-delete/review/site-config/risk-events/outcome）；讀取類（報告/訪客/設備/審計查詢）尚未逐筆寫審計 → 待補（2026-09-07 抽查，見 docs/reviews/2026-09-07-current-head-spotcheck.md） |
| 未授權存取事件 | 0 | 🟡 | 角色防升等＋路由/資料層 tenantId 隔離已落地（server.ts:574-579/611-615/641-645；repository types.ts:49-58,227-241；risk-postgres 全數 `WHERE tenant_id=$1`）；仍：註冊預設 security_admin、治理端點權限未收斂 → 需安全測試（2026-09-07 抽查） |

## C. 產品指標

| 指標 | 0-1 目標 | 狀態 | 目前依據 |
|---|---:|---:|---|
| 網站月掃描次數 | 5,000 | 🟡 | 掃描 API 已可用；需計數報表 |
| 掃描完成率 | ≥90% | ⬜ | 需前端埋點 |
| 報告分享率 | ≥5% | ⬜ | 分享功能尚未上 |
| SDK 安裝量 | 100（npm） | ⬜ | 尚未發 npm |
| 標準化報告累積 | 10 萬筆 | 🟡 | 報告已落庫；需累積 |
| 風險事件可獨立查詢 | 通過 | ✅ | /v1/risk-events |
| 設備指紋跨 session 聚類 | 可用 | ✅ | /v1/devices；收案已接線寫入（server.ts:1263-1268，僅具身分租戶）＋by-ip/relations 圖譜 API（2026-09-07 抽查） |

## D. 商業指標

| 指標 | 目標 | 狀態 | 驗證方式 |
|---|---:|---:|---|
| MRR | 6 個月 >0；12 個月 NT$30 萬+ | ⬜ | billing_records＋發票 |
| NRR | ≥110% | ⬜ | 訂閱報表 |
| 客戶流失率 | <3%/月 | ⬜ | 訂閱報表 |
| 高風險人工複核推翻率 | <5–10% | ⬜ | review_cases falsePositiveFlag |
| 自動封鎖誤報率 | 極低 | ⬜ | shadow mode 後統計 |
| 刪除請求完成率 | 100% | 🟡 | DELETE API 已接；需流程測試 |

## E. Phase 關卡（0-1 路線）

- Phase 3 完成：≥10 試用＋3 Pilot＋1 付費客戶連續 30 天 → ⬜
- Phase 3.5 完成：1 個垂直場景付費 Pilot＋行動端可區分模擬器/雙開 → ⬜
- Phase 4 完成（0-1）：MRR ≥ NT$10 萬＋1 客戶使用 >3 個月 → ⬜

## F. 每週更新 SOP

1. 貼上真實數字（掃描數、tenant 數、報告數、事件數、MRR）。
2. 依此文件把對應 ✅/🟡/⬜ 更新。
3. 未達標項目必須列出「下一個具體行動」與負責人。

## G. 2026-09-06 完成紀錄

- 掃描計數：`GET /v1/stats/scans`（租戶數＋平台總數）＋ repository countReports。
- IP reputation：`GET/POST /v1/network/ip-reputation`（資料庫存取＋審計）。
- SDK 發佈前置：docs/sdk-publish-checklist.md（prepack/files 已具備；實際 npm publish 待帳號授權）。
- 前台註冊表單：`/register` 自助註冊→取得 API Key→存入 localStorage。
- SEO 內容日曆：docs/seo-content-calendar.md（16 篇排程＋每週 SOP）。
- `/register` 入口：首頁 footer＋定價頁 CTA（Free/Developer 前往註冊）。
- 垂直 Demo：新增 `/demo` Hub 與 `/demo/login-risk`（真實掃描→伺服器評分→allow/challenge/review/block 建議）。
- 首頁完整化：掃描結果顯示隱私軌/欺詐軌分數、風險因素解釋與「下一步」CTA（註冊／登入風控 Demo／定價）；首頁頂部加入產品入口。
- 首頁區塊管理（2026-09-06）：`/admin/homepage` 可對首頁 10 個區塊開啟/關閉、顯示/隱藏、排序；設定存 localStorage，下次開啟一致。
- 管理入口合併＋DB 持久化（2026-09-06）：`/admin` 管理者工作台改頁籤（後台模組／首頁區塊）；新增 `site_configs` 表與 `/v1/admin/configs/:key`、`/v1/public/config/:key`；workbench/homepage 設定填 API Key 後同步資料庫，公開首頁從資料庫讀取。
- 後台模組資料化（2026-09-06）：新增 `module-data.ts` 資料字典，6＋1 每個模組對應 API 與欄位清單，可在模組列展開檢視；後續可由 field_definitions/Plugin Registry 動態供應。
- 真實報告詳情頁（2026-09-06）：`/admin/reports` 報告可點擊 → `/admin/reports/[reportId]`，依 6＋1 模組設定渲染真實報告、風險事件與快速處置。
- P0 現況抽查（2026-09-07，基準 76880f3）：tenant 隔離路由、review_cases/audit_logs tenant_id、devices 寫入接線、CSP headers、key revoke/rotate 五項全 PASS；詳見 docs/reviews/2026-09-07-current-head-spotcheck.md（殘留：註冊預設 security_admin、讀取類審計未逐筆、site_configs 全域列、CSP 非ce 化）。
