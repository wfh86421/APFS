# 插件目錄

可插拔插件依五類存放（規劃中）：

```text
detection/   檢測插件：browser（canvas/webgl/webgpu/audio/webrtc…）、network（dnsLeak/ipReputation/portProbe…）、android（root/cloneSpace/emulator…）、ios（jailbreak/appAttest…）、webview（consistency）
analysis/    分析插件：osMismatch、proxyVpnTor、webNativeMismatch、automationRuntime
scoring/     評分插件：privacyExposure、authenticity、automationRisk、networkTrust、streamingAbuse
policy/      政策插件：loginRisk、registrationRisk、paymentRisk、streamingPlaybackRisk、gameAntiCheat
output/      輸出插件：apiJson、webhook、dashboard、pdf、jsonExport、siem、slack
```

每個插件需附 `manifest.json`（id、version、platforms、permissions、input/output schema、riskLevel）。
