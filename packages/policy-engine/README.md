# @shieldscan/policy-engine

政策引擎：把評分轉成商業決策。

- 決策集合：`allow` / `review` / `challenge` / `limit` / `block` / `log_only`
- `ThresholdPolicy` — 通用門檻政策（登入、支付、看劇播放前檢查皆可掛載）
- 政策插件可依租戶情境選擇，例如 `policy.loginRisk`、`policy.streamingPlaybackRisk`、`policy.gameAntiCheat`
