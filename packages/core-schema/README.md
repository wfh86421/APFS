# @shieldscan/core-schema

統一資料契約套件。所有 SDK、API、資料庫、Dashboard 共享的型別定義：

- `EnvironmentReport` — 標準化報告主體
- `NormalizedSignal` — 標準化訊號
- `AnalysisIssue` / `ScoreBundle` — 分析與評分結果
- `PluginManifest` — 插件清單
- `PolicyDecision` — 商業決策（allow / review / challenge / block）

資料契約先於功能：任何端點的輸入輸出都必須符合此契約。
