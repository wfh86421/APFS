# ShieldScan SDK 整合指南（10 分鐘串接）

## 1. 取得 API Key

```bash
curl -X POST https://api.shieldscan.dev/v1/tenants \
  -H 'Content-Type: application/json' \
  -d '{"name":"我的服務","email":"dev@example.com","plan":"developer"}'
```

回傳的 `apiKey`（`shd_live_...`）只顯示一次，請立即保存。

## 2. 瀏覽器端（Browser SDK）

```bash
npm install @shieldscan/browser-sdk @shieldscan/core-schema
```

```ts
import {
  ShieldScanSDK,
  canvasModule,
  webglModule,
  webgpuModule,
  audioModule,
  screenModule,
  localeModule,
  timezoneModule,
  webrtcModule,
  uaModule,
  clientHintsModule,
  buildReport,
} from '@shieldscan/browser-sdk';

const sdk = new ShieldScanSDK({ sdkVersion: '0.1.0' });
for (const module of [
  uaModule, clientHintsModule, canvasModule, webglModule, webgpuModule,
  audioModule, screenModule, localeModule, timezoneModule, webrtcModule,
]) {
  sdk.register(module);
}

const session = await sdk.scan();
session.onProgress((event) => console.log(event.moduleName, event.percent + '%'));
const signals = await session.waitForCompletion();

const report = await buildReport(signals, {
  consent: { mode: 'standard', retentionDays: 90 },
  signingSecret: process.env.SIGNING_SECRET, // 正式簽章（選用）
});

const response = await fetch('https://api.shieldscan.dev/v1/reports', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${process.env.SHIELDSCAN_API_KEY}`,
  },
  body: JSON.stringify(report),
});
const { score, policy, integrity } = await response.json();
```

## 3. React 端

```tsx
import { useShieldScan } from '@shieldscan/react-sdk';

function ScanButton() {
  const { signals, scanning, scan } = useShieldScan({
    modules: [canvasModule, webglModule, webrtcModule],
  });
  return <button onClick={scan} disabled={scanning}>掃描</button>;
}
```

## 4. Node.js 端（後端驗證）

```bash
npm install @shieldscan/node-sdk @shieldscan/signing
```

```ts
import { collectServerSignals } from '@shieldscan/node-sdk';
import { verifySignedReport } from '@shieldscan/signing';

// 附加 Server 端信任錨點（HTTP headers / TLS JA4 介面）
const serverSignals = await collectServerSignals({ headers: req.headers, ip: req.ip });

// 驗證報告簽章（時效 5 分鐘）
const result = await verifySignedReport(report, process.env.REPORT_SIGNING_SECRET);
if (!result.valid) throw new Error(`簽章驗證失敗: ${result.reason}`);
```

## 5. Webhook 風險通知

```bash
curl -X POST https://api.shieldscan.dev/v1/webhooks \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/hooks/risk","events":["risk_event"]}'
```

報告風險等級為 high/critical 時，平台會 POST `risk_event` 到你的 Webhook
（最多重試 1 次，3 秒逾時）。

## 6. 計費與用量

```bash
curl https://api.shieldscan.dev/v1/billing/current \
  -H "Authorization: Bearer $API_KEY"

curl -X POST https://api.shieldscan.dev/v1/billing/invoices/current \
  -H "Authorization: Bearer $API_KEY"
```

定價：Free NT$0 / Developer NT$2,500/月 / Business NT$25,000/月起；
每月免費額度 1,000 單位，超量 NT$1/單位。
