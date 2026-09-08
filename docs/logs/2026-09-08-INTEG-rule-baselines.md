# 2026-09-08 INTEG 窗口：基準分布 rule_baselines 原型（代號 INTEG）

- **目標**：把「數據當數位黃金 Step2」落地——收案記錄事實維度、聚合出「規則 × 國家/ASN/時區」的命中基準（hit_rate），先於備用(試用)站展示。
- **關鍵決策**：
  - 新表 `report_facts`（每筆掃描：country/asn/tz_offset/rules_hit，冪等 UPSERT）+ `rule_baselines`（rule×dim×value → total/hits/hit_rate，UNIQUE）。
  - 收案時 server 寫 fact（score.explanations.ruleId ∪ report.issues.type；geo country/asn；timezone 訊號 offsetHours）；失敗不阻擋收案。
  - `scripts/aggregate-baselines.mjs`：全量重算（TRUNCATE+UPSERT，冪等），可 cron 每日。
  - 公開端點 `GET /v1/baselines`（僅聚合、無個人資料）；RiskRepository 增 insertReportFact/listBaselines（PG＋in-memory 雙實作）。
- **改動檔案**：infra init.sql、packages/repository（types/risk-postgres/in-memory）、apps/api server（fact 寫入＋端點）、scripts/aggregate-baselines.mjs、本日誌。
- **驗證**：repository typecheck EXIT=0（local junction）；api typecheck 受 junction 舊 dist 干擾、以 CI 為準。
- **待辦**：備用站 schema 套用＋api 重建→收案幾筆→跑聚合→/v1/baselines 展示；正式站待驗收後合 main 再同步。
