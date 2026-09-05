# 嚴謹查證模式 3 — 風險偵測管理平台（定版導入規劃）

> 狀態：已採納（2026-09-06）
> 來源：`嚴謹查證模式 3 風險偵測管理平台.md`（使用者桌面定版文件）
> 前置文件：[detection-module-optimal-plan.md](./detection-module-optimal-plan.md)
> 原則出處：[ShieldScan-0-1到商業化完整規劃.md](../ShieldScan-0-1到商業化完整規劃.md)

## 一句話定版

以「六模組決策型後台」為產品骨架，補入嚴謹查證的證據鏈、置信度、可解釋風險、人工複核、RBAC、審計、保留與演化機制，形成可落地、可審計、可長期演化的風險偵測管理平台。

## 一、核心決策鏈

```text
前端偵測 → 原始證據保留 → 結構化訊號抽取
→ 風險判斷與解釋 → 管理者裁決
→ 稽核、申訴、回饋、修正
```

四個必須同時滿足的目標：可落地、可審計、可長期演化、可信任。

## 二、後台報告詳情頁：6＋1 模組（定版）

1. 決策樞紐與快速處置（Verdict & Actions）
2. 異常與一致性矩陣（Conflict & Consistency）
3. 網路、IP 與地理（Network, IP & Geo）
4. 硬體與設備指紋（Hardware Fingerprint）
5. 瀏覽器與軟體環境（Browser & Environment）
6. 原始資料與稽核抽屜（Raw & Audit Drawer）
7. 治理抽屜（Governance，權限受限，預設不顯示）

### 決策樞紐不可只顯示數字

每個風險必須附：風險因素、嚴重度、置信度、可能原因、建議動作、可展開解釋。

```text
Risk Score: 78 / 100
Risk Level: High
Confidence: Medium
Recommended Action: Manual Review
Top Risk Factors: …（每項都有 Severity / Confidence / Explanation）
```

### 核心紅線

- 高風險 ≠ 自動封鎖：預設進入人工複核。
- 自動封鎖條件：risk_level=critical 且 ≥2 個獨立高風險訊號 且 誤報率達標 且 有申訴管道。
- 衝突不等於惡意；異常必須有解釋；高風險必須有證據鏈。
- 隱私防禦（如 Brave Canvas 篡改）與欺詐威脅分軌，不互相污染。

## 三、資料層（六層）

```text
1. Canonical Layer   environment_reports（raw_json + normalized_json，皆版本化）
2. Decision Layer    session_overview（0.5 秒決策列表用）
3. Risk Layer        risk_events（事件化：severity/confidence/evidence/rule_version）
4. Device Layer      device_fingerprints（跨 session 聚類，限權＋保留）
5. Network Layer     network_signals（open_ports、dns_leak_list 等結構化）
6. Governance Layer  audit_logs / review_cases / appeal_cases /
                     retention_policies / consent_records /
                     field_definitions / model_versions / score_explanations
```

原則：

- 維持 `EnvironmentReport` 為單一事實來源，避免過度正規化。
- raw 與 normalized 分開保存且版本化。
- 高風險事件必須能被獨立查詢（risk_events）。
- 指紋可聚類但必須可限權、設保留期限、可刪除。

## 四、欄位證據鏈（高風險/高敏感欄位必備）

```json
{
  "field": "network.open_ports",
  "value": [22, 3389],
  "source": "network_probe",
  "confidence": "medium",
  "sensitivity": "medium",
  "collected_at": "2026-08-03T20:10:17+08:00",
  "schema_version": "1.4.0",
  "evidence": { "method": "passive_or_authorized_probe", "raw_reference": "raw.network.portScan" },
  "policy": { "access": ["security_admin", "risk_analyst"], "retention": "policy:network_high_risk" }
}
```

## 五、風險引擎：雙軌制＋可解釋評分

```text
Privacy Risk：DNS/WebRTC 洩漏、VPN 宣稱 vs 實際、隱私工具干預、個資暴露
Fraud Risk ：Open Ports、OS Mismatch、Emulator、指紋不穩、黑名單、行為異常
```

分數輸出需附：score_version / model_version / factor_list / factor_weight / factor_confidence / explanation。

## 六、規則引擎定版（優先順序）

| 等級 | 條件 | 動作 |
|---|---|---|
| 🚨 高 | open_ports 含 22/3389 且來源疑似行動裝置 | requires_review=true、auto_block=false；多訊號才可臨時封鎖 |
| ⚠️ 中 | UA 宣稱 OS ≠ 底層 Platform | requires_correlation=true；需檢查 UA reduction/Client Hints/模擬器等 |
| ℹ️ 低 | 僅 Canvas 篡改且無其他矛盾 | privacy_defense=true、fraud_weight=none、不封鎖 |
| 🟡 情境 | 宣稱 VPN/代理但 DNS 洩漏 | expected_anonymity=true → privacy_risk=high |
| ✅ 加分 | IP 7 天活躍低、時區/語言一致、WebRTC 一致 | 弱加分；Bot=No 僅弱參考 |

## 七、RBAC 與審計（定版方向）

| 角色 | 遮罩 IP | 完整 IP | 完整經緯度 | 指紋詳情 | Raw JSON | 封鎖 | 審計 |
|---|---|---:|---:|---:|---:|---:|---:|
| 客服 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 風控分析師 | ✅/部分 | 依申請 | ❌ | 部分 | ❌ | 建議 | ❌ |
| 資安主管 | ✅ | ✅ | ✅ | ✅ | 依申請 | ✅ | ✅ |
| 合規/法務 | 視需求 | 依申請 | 依申請 | ❌ | ❌ | ❌ | ✅ |

所有敏感存取（完整 IP、經緯度、Raw JSON、黑名單、封鎖、匯出、刪除）都要寫 audit_logs。

## 八、隱私合規

- 每份報告需有 consent_status / legal_basis / purpose / retention_until / deletion_status。
- raw_json 短期保留；risk_events 較長但假名化；device_fingerprints 高敏感需期限；精確座標非必要不長期保存。
- 刪除請求完成率 100% 為驗收項。

## 九、長期演化

- Schema Registry：field_definitions 管理 active / experimental / deprecated / removed。
- 版本控制：schema_version、sdk_version、extractor_version、rule_version、score_model_version、ui_module_version。
- 新欄位流程：提案 → 影子模式 → 穩定性測試 → 風險貢獻測試 → 限權啟用 → 全面啟用/棄用。
- 漂移監控：欄位缺失率、指紋穩定度、分數分布、誤報率、複核推翻率、黑名單準確率、瀏覽器分布、hash 漂移。

## 十、落地路線圖（Phase 0–5）

| Phase | 交付 | 完成標準 |
|---|---|---|
| 0 定版 | 六模組架構、欄位目錄、風險等級、RBAC 矩陣、保留原則 | 產品/工程/風控/合規一致 |
| 1 資料基礎 | environment_reports、session_overview、risk_events、device_fingerprints、network_signals | 每份報告可存 raw + normalized；高風險事件可獨立查詢 |
| 2 後台決策頁 | ①–⑥ 模組（Raw 預設收合） | 3 秒內可完成初步判斷 |
| 3 風險引擎與審查 | 規則引擎、分數解釋、review/appeal、false_positive | 高風險可人工複核、封鎖有原因與審計 |
| 4 治理與合規 | audit_logs、retention、consent、deletion、RBAC masking | 敏感存取可審計、可刪除、可產出合規報告 |
| 5 影子模式與校準 | shadow mode、precision/recall/FPR、calibration | 自動動作誤報率可接受、複核閉環 |

## 十一、驗收指標（定版）

| 類別 | 指標 | 目標 |
|---|---|---|
| 資料完整性 | 必要欄位缺失率 | < 1% |
| 可解釋性 | 高風險事件有證據鏈 | 100% |
| 審計 | 敏感欄位存取有日誌 | 100% |
| 權限 | 未授權存取 | 0 |
| 風險準確性 | 高風險人工複核推翻率 | <5–10%（依業務校準） |
| 刪除合規 | 刪除請求完成率 | 100% |
| 演化 | 新欄位可影子模式啟用 | 必要能力 |
| 效率 | 關鍵風險 3 秒內可見 | 通過 |
| 追溯 | Raw JSON 可版本重播 | 通過 |

## 十二、與現有 monorepo 的對應

- `packages/core-schema`：擴充證據鏈欄位與治理欄位。
- `packages/browser-sdk`：新增 fonts / clientRects / mediaDevices 模組；既有模組補 confidence/source。
- `packages/repository`：建立查詢層（risk_events / device_fingerprints / network_signals / audit_logs）。
- `packages/scoring-engine`：改為雙軌（privacy/fraud）＋可解釋輸出。
- `packages/policy-engine`：補 review/appeal、多訊號門檻、自動封鎖條件。
- `packages/tenant`：擴充 RBAC 角色與遮罩。
- `apps/web-scanner /admin`：模組目錄改為 6＋1（含 governance，visible=restricted）。
- API：新增 /v1/reports/{id}/review、/blacklist、/appeal、audit 查詢。

