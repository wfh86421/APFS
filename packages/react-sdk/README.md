# @shieldscan/react-sdk

React Hook 與元件包，包裝 `@shieldscan/browser-sdk`：

```tsx
import { useShieldScan, canvasModule, webgpuModule } from '@shieldscan/react-sdk';

function ScanButton() {
  const { signals, scanning, scan } = useShieldScan({
    modules: [canvasModule, webgpuModule],
  });
  return <button onClick={scan}>{scanning ? '掃描中…' : '開始掃描'}</button>;
}
```
