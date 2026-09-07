# 並行 Agent 分派範本（AGENT-DISPATCH）

多組並行 agent 共用同一 repo（本機 `歸檔`、GitHub `wfh86421/APFS`、VPS `/root/APFS`）。
**每位 agent 開工前先讀根目錄 `AGENTS.md`；本檔提供「如何下指令」的範本與代號登記。**

## 1. 開工指令範本（對每位 agent 貼上這段）

> 你現在是並行開發組 agent，代號：**<代號>**。開工前先讀 repo 根目錄 `AGENTS.md`，遵守記錄與 git 規約。
> 本次指派：**<一句話目標>**
> - 分支：`<分支名>`（`feat/…` / `fix/…` / `chore/…`）
> - 完成定義：<可驗證結果，如「CI 全綠」「E2E 通過」>
> - 結束前：在 `docs/logs/YYYY-MM-DD-<代號>-<主題>.md` 寫窗口日誌（目標→決策→改動檔案→驗證→待辦）；commit 訊息帶 `（<代號>）`；`git pull --rebase origin main` 後推送。
> 不得改動其他 agent 的分支與日誌檔；禁止 force-push main。

## 2. 代號登記表（每次分派先填一行）

| 代號 | 窗口 | 指派目標 | 分支 | 合入 main 時間 |
|---|---|---|---|---|
| A | YYYY-MM-DD | | | |
| B | YYYY-MM-DD | | | |
| C | YYYY-MM-DD | | | |
| 整合者 | — | 合併＋CI＋部署＋CHANGELOG | main | — |

## 3. 建議工作切分（避免互相踩檔）

| 工作流 | 建議範圍 | 備註 |
|---|---|---|
| 規則引擎 / 評分 | `packages/scoring-engine`、`packages/policy-engine`、`apps/api`（評分管線） | 同一大檔同一區域只給一位 agent |
| 管理後台 / 視覺 | `apps/web-scanner`（admin、demo、privacy） | 與 API 端點串接時先定義契約 |
| 資安 / 信任邊界 | `apps/api`（auth/租戶）、`packages/tenant`、`packages/repository` | 參見 `docs/reviews/` 報告清單 |
| 資料層 / schema | `infra/docker/postgres/init.sql`、`packages/repository` | **唯一位改 schema**；改完跑 CI Apply schema |

## 4. 鐵律

1. 同主題只派一位；並行 = 不同主題同時跑。
2. `main` 保持可部署；功能在分支上，**由整合者在 CI 綠後合入 main**。
3. 「本機綠 ≠ CI 綠」：碰 schema/SQL/測試 tenant 值，以真實 Postgres（CI `Apply schema`/`test:postgres`）驗證；UUID 欄位不接受非 UUID 字串。
4. 每窗口一個日誌檔（`docs/logs/YYYY-MM-DD-<代號>-<主題>.md`），檔名含代號、永不覆寫他人。
5. 推送前一律 `git pull --rebase origin main`；衝突保留雙方內容。

## 5. 窗口日誌格式（複製使用）

```markdown
# YYYY-MM-DD <代號> 窗口：<主題>
- 目標：…
- 關鍵決策：…
- 改動檔案（commit 前綴）：…
- 驗證結果：…
- 未完成/待辦：…
- 給其他 agent 的備註：…
```

## 6. 整合者契約（合併前檢查清單）

- [ ] 分支已 `git pull --rebase origin main`
- [ ] `pnpm -r typecheck` 與 `pnpm -r build` 通過
- [ ] 相關單元測試通過；碰 schema 者有 CI Apply schema＋test:postgres 綠
- [ ] CI run 全綠（GitHub Actions）
- [ ] 窗口日誌已寫入 `docs/logs/`；里程碑級已更新 `CHANGELOG.md`
- [ ] 合入 main 後：更新代號表、需要時部署 VPS 並回填部署狀態
