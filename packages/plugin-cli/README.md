# @shieldscan/plugin-cli

PluginManifest 驗證 CLI（Phase 0 交付物）。

## 安裝

```bash
pnpm --filter @shieldscan/plugin-cli build
pnpm --filter @shieldscan/plugin-cli exec shieldscan-plugin --help
```

或在 workspace 內連結：

```bash
pnpm --filter @shieldscan/plugin-cli link
```

## 用法

```bash
# 驗證單個 manifest（通過 exit 0，失敗 exit 1，可用於 CI）
shieldscan-plugin validate plugins/detection/browser.canvas/manifest.json

shieldscan-plugin --version
shieldscan-plugin --help
```

## 與 core-schema 的關係

驗證規則完全來自 `@shieldscan/core-schema` 的 `zPluginManifest`：

- id / name / schema 不得為空。
- version 必須為 semver。
- 欄位必須精確（`strict()`，多餘欄位會失敗）。
- platforms 至少一個、confidence/score 有範圍限制。

新插件提交前先跑 `shieldscan-plugin validate`，通過後才能進 Plugin Registry。
