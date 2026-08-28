# @shieldscan/scoring-engine

評分引擎：規則引擎 + 跨層一致性驗證 + ML 異常檢測三軌合併。

- `ScoringEngine` — 依 Scoring Profile 套用規則並產出分數
- `ScoringProfile` — 不同產業（隱私/金融/看劇/遊戲）不同權重與門檻
- `defaultRules()` — 對應原始報告的預設評分規則

企業客戶需要可解釋性：每個扣分都必須帶 reason，不能只回傳黑盒分數。
