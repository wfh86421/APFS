# Node SDK Demo（後端收單示範）

模擬第三方後端「10 分鐘串接」：附加 Server 訊號 → 驗證簽章 → 呼叫評分。

```bash
pnpm install
pnpm demo
```

需要環境變數（可選）：

- `REPORT_SIGNING_SECRET`：設定後會實際驗證報告簽章。
- `SHIELDSCAN_API_KEY`：設定後會呼叫 `POST /v1/reports`。
