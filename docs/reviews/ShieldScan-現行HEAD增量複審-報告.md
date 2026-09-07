# ShieldScan — 現行 HEAD 增量複審報告（Agent Teams）

> **審查基準**：現行 HEAD `ee2ff6e`（worktree `6c3f`，即上線部署版本；相較先前審查之封存版 `cfbb540` 領先 43 commits）
> **方法**：3 個 Agent 團隊並行——(A) 現行資安與信任邊界、(B) 定版規劃↔程式碼對齊稽核、(C) Web 新增面（admin/demo/register/risk）；每條 finding 附「現行檔相對路徑:行號＋逐字引句」，關鍵宣稱另經主審標靶複核（見 §4）。
> **定版依據**：`docs/risk-detection-platform-adopted-plan.md`（風險偵測管理平台）、`docs/validation-tracker.md`、`ShieldScan-0-1到商業化完整規劃.md`
> 關聯文件：封存版完整審查見 `ShieldScan-code-review-report.md`（該檔基準 cfbb540，本檔為其增量更新）

---

## 1. 執行摘要

相對封存版，現行碼已有實質進展：報告/風險/設備表均已具 `tenant_id`、`GET /v1/reports` 列表與 `countReports` 已按租戶過濾、審計改寫入 Postgres、`signature` 放寬為 `z.string()` 且驗證在伺服器變造前執行、CI 順序已修（Build→Apply schema→Unit tests）、後台 6+1 模組與真實報告詳情頁上線、雙軌（隱私/欺詐）評分核心與 `verify-scoring.mjs` 落地。

**但現行最大的風險面集中在一處：決策/治理層（risk-events、review-cases、devices、audit-logs、site_configs、ip-reputation）仍是「全域開放 + 自助註冊即拿 security_admin」**，形成一條免驗證的跨租戶讀取/改判/濫刪攻擊鏈（見 §2 P0-1/P0-2）。RBAC 遮罩與租戶隔離目前只覆蓋「報告列表/詳情」兩個端點，其餘管理端點形同無授權。

本輪共 **24 條 findings（2 Critical／9 High／11 Medium／2 Low）**（未去重，A/C 對同一根因各自獨立發現）。

## 2. 高風險清單（現行 HEAD 仍成立）

### P0
1. **跨租戶物件讀取/刪除仍無比對（A-Critical / B-High / C-Critical 重複發現）**：`GET/DELETE /v1/reports/:id`、`GET/DELETE /v1/visitors/:visitorId(/reports)` 直接 `getReport(id)`/`deleteReport(id)` 等（server.ts:775-840；postgres.ts:106-114,138-146,202-217），repository 方法皆無 `tenantId` 參數與條件。**攻擊鏈（已驗證各環節）**：免驗證自助註冊（service.ts:43 直接發 `security_admin` key）→ `GET /v1/audit-logs`（risk-postgres.ts:540-553 全表）撈 reportId/actorIp → `GET /v1/reports/:id` 讀完整 Raw/IP/指紋 → `DELETE` 濫刪；亦可改判他租戶 review-case、全量讀風險事件/設備指紋。
2. **RBAC 遮罩形同虛設**（A-High / B-High / C-High）：註冊即最高權限 `security_admin`（tenant/service.ts:43）；自助加發 key 可自選角色 `body.role ?? 'security_admin'`（server.ts:335）；`maskStoredReport` 只套在報告列表/詳情 2 個端點（server.ts:758,778）；客服角色也可刪資料、改 decision='block'、讀審計/IP、寫 config。定版四角色矩陣（adopted-plan:108-115）未落地（無 compliance 角色）。
3. **決策鏈「證據鏈」承諾空洞**（B-High）：`POST /v1/reports` 收案只開空 review case（`riskEventIds: []`，server.ts:710-722），**從不自動產生 risk_events**；全 repo 唯一事件寫入點是手動 `POST /v1/risk-events`，且 `tenantId` 採 `result.data.tenantId ?? auth.tenant.tenantId`（server.ts:421）——租戶可偽造任意 severity/rule 的事件；`review_cases` 表**無 tenant_id 欄**（init.sql:284-302）。

### P1（High）
4. **全域治理資料可被任一租戶覆寫**：`site_configs` 單一全域列（risk-postgres.ts:600-602 無 tenant），`PUT /v1/admin/configs/:key` 僅需任一 key（server.ts:443-455）即可改全站公開首頁；`GET /v1/public/config/:key` 無 allowlist（:429-433）。devices/risk-events/audit 查詢 SQL 全無租戶條件（risk-postgres.ts:222,333,542-543）。
5. **security_admin key 明文存 localStorage＋全站無安全 headers**（C-High）：`localStorage.setItem('shieldscan.admin.apiKey', ...)`（register-form.tsx:27）；全 app 零 CSP/X-Frame-Options/STS（10 處命中皆為 @types/node 型別檔）；admin 無任何路由守衛/middleware → 任一 XSS 即全權淪陷。
6. **簽章仍不可作為安全閘**（A-High）：全域單一 `REPORT_SIGNING_SECRET`（server.ts:58）、未配置即整段停用（:195）；canonical 仍不含 subjectId/consent/tenantId/issues（signing:33-46）→ 持 key 可竄改這些欄位而不被發現（污染訪客聚合、操控分數、拉長保留）。
7. **定版規則引擎未落地**（B-High）：requires_review/requires_correlation/privacy_defense/expected_anonymity 決策標籤與 auto_block 閘（adopted-plan:100-104）無實作；policy-engine 仍為死碼；defaultRules 6 條中 4 條因觸發 type/key 斷鏈永不生效（沿用封存版根因）。
8. **資料層六層只落地四層**（B-Medium）：無 `environment_reports`(raw+normalized 版本化)/`session_overview`/`retention_policies`/`consent_records`/`model_versions`/`score_explanations`；consent 治理欄位（legal_basis/retention_until/deletion_status）缺；`expires_at` 只寫不讀、無清理 job；`deleteVisitor` 不連動 risk/device/review 表（GDPR 刪除不徹底）。
9. **`/v1/devices`「✅」恆空轉**（B-Medium）：`upsertDeviceFingerprint/upsertNetworkSignal` 在 apps 內**零呼叫者**（僅測試）→ 生產 devices 表恆空、network_signals 無讀取 API；「跨 session 聚類」承諾未接主流程。
10. **API Key 仍無撤銷/輪換/清單**（A-Medium）：revoke 寫入路徑全 repo 零命中；`POST /v1/tenant/keys` 無限自助簽發不審計。

### P2（Medium/Low，精選）
- 詳情頁把 `fraudScore: 100 − privacyScore` 當真實雙軌分數、清空 explanations（report-detail.tsx:91-96）——「真實報告」頁資料造假（C-Medium）。
- demo `/login-risk` 決策表與伺服器 `scoreToPolicy` 交錯：demo medium→challenge、high→review（login-risk-demo.tsx:37-38），server medium→review、high→challenge（server.ts:106-109）；critical 建議直接 block 未標定版前置條件（C-Medium）。
- local-only 仍走 Google/Twilio STUN（webrtc.ts:16-21），與「不離機」文案矛盾（C-Medium，封存版未修）。
- 限流：in-memory、超限誤報 401 而非 429、匿名 ingest/註冊/analyze 無限流、zod 陣列無上限（A-Medium）。
- audit 無 tenant/actor 身分、actorIp 可 XFF 偽造、敏感讀取（報告/訪客/審計/設備）不寫審計（A-Medium）——tracker「敏感存取有日誌 100%」未達成。
- 管理入口無 PIN/守衛；`accessLevel:'restricted'` 僅定義未執行（B-Low）；module-data 字典欄位路徑與真實 payload 不符（C-Low）；e2e 對 /register、/demo、/admin* 零覆蓋且 standard 上送仍以 route.fulfill mock（C-Medium）。

## 3. 定版 vs 現況（對齊程度）

| 定版承諾 | 現況 | 判定 |
|---|---|---|
| 6+1 模組後台＋Governance restricted | catalog.ts 七分類＋真實詳情頁上線 | 🟢 落地（restricted 僅 UI 隱藏） |
| RBAC 四角色＋遮罩矩陣 | 僅 2 端點遮罩；預設全員 security_admin；可自選角色；無 compliance | 🔴 落差 |
| 租戶隔離（未授權=0） | 僅列表過濾；單筆讀/刪、events/devices/audit 全全域 | 🔴 落差 |
| 高風險事件獨立查詢＋證據鏈 100% | risk_events 手動/可偽造、自動收案無事件 | 🔴 落差 |
| 雙軌風險引擎＋可解釋輸出 | engine 已有 privacy/fraud/explanations，但未持久化、admin 用鏡像分數 | 🟡 半落地 |
| 資料層六層＋raw/normalized 版本化 | 缺 environment_reports/session_overview/多張 governance 表 | 🟡 半落地 |
| 保留/刪除/consent 治理 | expires 只寫不讀、delete 不級聯、無 consent 治理欄位 | 🔴 落差 |
| 自動化規則表＋auto_block 閘 | 無對應規則；defaultRules 半數斷鏈 | 🔴 落差 |

## 4. 主審標靶複核紀錄（現行 HEAD）

| 宣稱 | 複核方式 | 結果 |
|---|---|---|
| 註冊即簽發 security_admin | tenant/service.ts:43 | ✅ |
| 自助加發 key 可自選角色 | server.ts:335 | ✅ |
| risk-events tenantId 採 client 值 | server.ts:421 | ✅ |
| review_cases 無 tenant_id | init.sql:284-302 逐欄 | ✅ |
| events/devices/audit SQL 無租戶條件 | risk-postgres.ts:222,333,542-543 | ✅ |
| devices 寫入零呼叫者（apps） | grep upsertDevice/NetworkSignal | ✅ |
| site_configs 全域單列覆寫 | risk-postgres.ts:600-602 | ✅ |
| 詳情頁鏡像 fraudScore | report-detail.tsx:91-96 | ✅ |
| demo 與 server policy 交錯 | login-risk-demo.tsx:37-38 vs server.ts:106-109 | ✅ |
| 全站無 CSP 等 headers | 全 app grep（10 命中全在 @types/node） | ✅ |
| 封存版多項已修（tenant_id、列表過濾、audit 入 DB、signature 放寬、CI 順序） | 現行碼逐行 | ✅ 已修 |

## 5. 做得好的地方（現行 HEAD）

- 契約層大幅進化：core-schema 新增 Sensitivity/EvidenceConfidence/FieldStatus/RetentionClass/RiskEvent/FieldDefinition/ReviewCase 等 zod `.strict()` 契約，init.sql 對應新表逐欄一致、SQL 全參數化。
- 雙軌評分核心落地並有 `scripts/verify-scoring.mjs` 驗證「Canvas 只扣隱私軌、OS 衝突只扣欺詐軌」。
- 渲染安全面乾淨：全樹無 dangerouslySetInnerHTML/動態 href；reportId 進 URL 前有 encodeURIComponent。
- demo/首頁誠實呼叫真實 server（/v1/analyze）並有伺服器失敗降級 warning；匿名上送死路已修（signature 可空、local-only 不上傳）。
- 收案 high/critical 自動開 review case 且不自動封鎖，符合「高風險≠自動封鎖」紅線的敘事方向（雖事件鏈未接）。

## 6. 開放問題（需產品/架構決策）

1. RBAC 目標模型：adopted-plan 矩陣是「平台營運者跨租戶後台」角色，現行卻綁在「租戶 API Key」且缺合規角色——兩者語意誰對？決定 events/devices/audit/delete 的授權與租戶過濾設計。
2. risk_events 自動事件化（規則 deduction → RiskEvent → 回填 review case riskEventIds）與 score_explanations 落庫是否為下一階段？Phase 3「完成」定義是否被誤標？
3. 管理登入：總綱「管理 PIN」vs 目前 localStorage 明文 security_admin key——是否切 httpOnly cookie session？
4. device_fingerprints/network_signals 自動寫入管線與 network_signals 查詢端點何時接主流程？（「/v1/devices ✅」目前恆空）
5. 公開站台（tenant_id=NULL）與租戶資料的 owner 邊界與「全域單一池」舊決策是否仍成立？

---

*本檔為唯讀審查產物。行號以 HEAD `ee2ff6e` 為準；修復前請以當下 HEAD 複核。*
