# 2026-09-09 INTEG 窗口：後台欄位模組分類 × 數據價值/護城河 戰略補強（代號 INTEG）

- **目標**：把新輸入的「管理者後台檢測欄位模組分類（5 大模組）戰略方案」對照 repo 既有定版與真實 code，找出「哪些數據有價格／有價值可當護城河（尤其設備指紋數據）」，產出定版補強策略文件（不另立新分類）。
- **關鍵決策**：
  - 新輸入與 Qwen3.8-Max 方案同源，主體已被 `docs/detection-module-optimal-plan.md`（2026-09-06 定版）吸收 → 以**補強 v2** 形式撰寫，不新增競爭分類。
  - 「有價格」粒度＝三層賣法（逐次計費 NT$1/單位 → 場景模板加價 → 累積資料產品），非單欄位定價；引用 repo 真實 Tier（Free/Developer NT$2,500/Business NT$25,000/Enterprise 報價）。
  - 護城河分 🟢通用／🟡證據／🔴核心指紋／🧬資料層；**設備指紋 hash 群＋跨 session 聚類＋rule_baselines 累積**為真護城河。
  - 核對 code：`zRiskEventType`17 類、`FieldDefinition(accessRoles/sensitivity/retentionClass/uiModule)`、`zScoreBundle` 四軌、devices 表 `canvas/webgl/webgpu/audio/fonts/client_rects` hash 欄位；**Fonts/ClientRects/MediaDevices SDK 未採集＝已留欄位的 Gap**（最小修復點）。
- **改動檔案（commit 前綴）**：
  - `docs/admin-module-value-moat-strategy.md`（新檔：現況裁決表、價格地圖、護城河分層、6 段×valueTier、落地工作包 W1–W7、開放問題）
  - `docs/logs/2026-09-09-INTEG-module-value-moat.md`（本檔）
- **驗證結果**：純文件改動，無程式碼變更；欄位現況以 `packages/core-schema`、`packages/browser-sdk`、`packages/repository` grep 核對（typecheck 不受影響）。
- **未完成/待辦**：文件待使用者對 §6 開放問題表態後，才可分派 W1–W7（各自開分支跑 CI）。
- **給其他 agent 的備註**：W1（fonts/clientRects/mediaDevices 採集）與 W6（跨 session 聚類）是「真護城河」最短補齊路徑；W5（velocity 實算）對齊 M1 WP2，勿重複開工。
