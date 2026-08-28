# @shieldscan/port-scanner

合規端口掃描（TCP connect 探測）。

安全約束（呼叫端必須執行）：

1. 只掃請求者的來源 IP。
2. 每 IP 限流（建議每小時 5 次）。
3. 每次掃描寫審計日誌。

```ts
import { scanPorts } from '@shieldscan/port-scanner';

const results = await scanPorts('49.214.1.196', [22, 3389, 445, 80, 443]);
```
