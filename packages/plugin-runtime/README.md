# @shieldscan/plugin-runtime

插件化核心平台的執行期介面：

- `Kernel` — 事件總線 + 插件管理 + 生命週期 + 沙箱
- `EventBus` — 所有跨模組通訊的唯一通道
- 五類插件介面：`DetectionPlugin` / `AnalysisPlugin` / `ScoringPlugin` / `PolicyPlugin` / `OutputPlugin`

核心平台永不包含業務邏輯；業務能力一律以 Plugin 掛載。
