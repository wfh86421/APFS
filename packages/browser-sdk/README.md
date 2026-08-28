# @shieldscan/browser-sdk

瀏覽器端採集 SDK（framework-agnostic）。以模組方式掛載，不綁定 React/Vue。

內建模組（MVP 第一批）：

- `browser.canvas` — Canvas 指紋 + 篡改偵測
- `browser.webgl` — GPU Vendor/Renderer
- `browser.webgpu` — WebGPU 深度指紋（30+ bits，2026 核心）
- `browser.audio` — AudioContext 指紋
- `browser.screen` — 螢幕/視口/觸控
- `browser.locale` / `browser.timezone` — 環境一致性驗證用
- `browser.webrtc` — STUN 多節點洩漏檢測

```ts
import { ShieldScanSDK, canvasModule, webgpuModule } from '@shieldscan/browser-sdk';

const sdk = new ShieldScanSDK({ sdkVersion: '0.1.0' });
sdk.register(canvasModule);
sdk.register(webgpuModule);

const session = await sdk.scan();
const signals = await session.waitForCompletion();
```
