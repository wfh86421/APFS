# SDK npm 發佈前置清單

> 更新：2026-09-06

## 目標套件（beta）

- `@shieldscan/core-schema`
- `@shieldscan/signing`
- `@shieldscan/browser-sdk`
- `@shieldscan/react-sdk`
- `@shieldscan/node-sdk`

## 已具備（✅）

- 各套件有 `publishConfig.access=public`、`files:["dist"]`、`prepack: tsc`。
- Monorepo build 通過（`pnpm -r --filter "./packages/**" build`）。
- workspace:* 依賴會由 pnpm publish 轉成實際版本。

## 發佈前手動確認

1. `pnpm -r --filter "./packages/**" build` 通過。
2. `npm login`（有 `@shieldscan` scope 權限的帳號）。
3. 對每個套件執行 `pnpm publish --dry-run`，確認 tarball 只含 dist。
4. 依序發佈：core-schema → signing → browser-sdk → react-sdk → node-sdk（先 beta tag）。

```bash
pnpm -r --filter "./packages/**" build
pnpm --filter @shieldscan/core-schema publish --tag beta --dry-run
pnpm --filter @shieldscan/signing publish --tag beta --dry-run
pnpm --filter @shieldscan/browser-sdk publish --tag beta --dry-run
pnpm --filter @shieldscan/react-sdk publish --tag beta --dry-run
pnpm --filter @shieldscan/node-sdk publish --tag beta --dry-run
```

## 尚未完成（需要你的 npm token／帳號授權）

- 實際 `npm publish`（Beta）。
- 套件版本正式升到 `0.2.0` 前建議先發布 `0.1.0-beta.N`。

