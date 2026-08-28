# @shieldscan/api

核心 API（Fastify）。規劃端點：

```text
POST /v1/reports            接收標準化報告
GET  /v1/reports/{id}       查詢報告
POST /v1/analyze            分析與評分
GET  /v1/plugin-profile     取得租戶/情境的插件清單
POST /v1/webhooks           註冊風險事件回調
```

```bash
pnpm --filter @shieldscan/api dev
```
