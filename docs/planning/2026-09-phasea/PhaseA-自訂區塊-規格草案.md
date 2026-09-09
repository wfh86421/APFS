# ShieldScan Phase A —「自訂區塊＋版型」規格草案（v0.2 供取捨）

> 狀態：設計草案・尚未實作・依 2026-09-07 意向結論（A / D1=safe / D2=策展方向 / D3=合規累積 / D4=暫緩）
> **v0.2 更新（依取捨回覆）**：① 範圍擴為**每個後台頁皆可拆區塊**（不限首頁）；② 排序採 ⬆⬇ 按鈕；③ 預設區塊 5+1（含設備指紋預設停用）；④ 設定抽屜採「區塊定義自動生表單」。
> 原則：**設定只存「資料」，不存程式碼**；全部 tenant 隔離；沿用現有 zod/audit/RBAC 慣例。

---

## 1. 目標與非目標

**目標**
1. 後台從「固定頁面」變成「**每頁皆可自訂**」：每一後台頁（overview/reports/events/devices/homepage/治理…）由一組**區塊（block）**組成，管理者可
   - 啟用／停用（停用後不顯示，資料保留）；
   - 調整**順序**（⬆⬇ 按鈕）；
   - 編輯每塊允許的**文字／參數**（標題、副標、數值範圍、顏色/圖示、顯示筆數…），
   - 變更立即生效並寫審計。
2. 用**「區塊＝程式內定義＋租戶設定」**兩層模型，替 Phase B（catalog 安裝）預留接口——但**本輪不建 catalog、不做安裝**。

**非目標（本輪不做）**
- ❌ 管理者自由編輯「程式碼／HTML」（D1 取捨為安全版；改碼留待未來並需安全墊底）
- ❌ 第三方模組市場／安裝卸載（Phase B，另案）
- ❌ 訪客設備指紋新模組（D4 暫緩）
- ❌ 跨租戶後台、全域「單一設定」（本輪**每租戶各自版面**；現有 `site_configs` 為全域單列，不動其既有語意）

---

## 2. 概念模型

```
模組市場(遠景/B)          本輪(Phase A)
catalog 定義區塊 ──提供──▶ block 定義(程式內)
                               │
                           每租戶覆寫層 ──▶ dashboard_blocks 表 (tenant 隔離)
                           啟用/順序/設定(JSONB, 依 block schema 驗證)
```

- **Block 定義（code）**：key、名稱、說明、可設定欄位 schema（zod）、預設設定、角色權限、預設啟用與順序、對應的資料查詢（沿用現有 admin 模組的讀取端點）。
- **租戶覆寫層（DB）**：只存「與預設不同的東西」→ 回傳時與定義合併（default merge），新模組上線自動出現在既有租戶（若未顯式停用）。

**本輪預設區塊（以現有 6+1 模組為映射，草案）**

| block key | 對應現有 | 可設定欄位（示例） |
|---|---|---|
| `overview.summary` | /admin/overview | 標題、顯示哪些 KPI 卡（多選）、卡色 |
| `reports.recent` | /admin/reports | 標題、顯示筆數(5–50)、是否顯示 Raw/IP |
| `events.feed` | /admin/events | 標題、severity 過濾、筆數 |
| `devices.table` | /admin/devices | 標題、筆數、是否顯示硬體 hash |
| `review.queue` | /admin/reports（複核佇列） | 標題、只顯示 pending |
| `homepage.hero` | /admin/homepage | 標題、副標、CTA 文字（純文字，非 HTML） |
| `audit.trail` | 審計 | 標題、筆數 |

> 定義集中在「block registry」（仿現有 `src/modules/catalog.ts` 與 `field_definitions` 的分工），
> 每塊的可設定欄位是**結構化 schema**，UI 依 schema 自動產生表單（不必為每塊手刻）。

---

## 3. 資料模型（新增，套用既有租戶隔離慣例）

```sql
-- 追加至 infra/docker/postgres/init.sql（冪等）
CREATE TABLE IF NOT EXISTS dashboard_blocks (
    tenant_id   UUID NOT NULL,
    block_key   VARCHAR(64) NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    position    INTEGER NOT NULL DEFAULT 0,
    settings    JSONB NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by  VARCHAR(64),
    PRIMARY KEY (tenant_id, block_key)
);
CREATE INDEX IF NOT EXISTS idx_dashboard_blocks_tenant
    ON dashboard_blocks(tenant_id, position);
```

- `settings` 在 API 層以**每 block 的 zod schema** 驗證後才寫入（拒絕未知鍵；長度上限）。
- 不存 HTML／自由代碼；僅「純文字＋有限枚舉＋數值」。
- 遷移/部署：與 init.sql 同檔追加 → CI Apply schema 與正式庫 init-db 一併生效（沿用現有流程）。

---

## 4. API（草案，Fastify，tenant-scoped + audit）

| 方法 | 路徑 | 說明 | 權限 |
|---|---|---|---|
| GET | `/v1/dashboard/blocks` | 回傳「定義＋租戶覆寫」合併後的區塊清單（含 enabled/position/settings） | 任一有效 key |
| PUT | `/v1/dashboard/blocks/:blockKey` | 更新 `{ enabled?, position?, settings? }`；settings 依該 block schema 驗證，400 附錯誤 | security_admin（沿用 `roleOfRequest`） |
| POST | `/v1/dashboard/blocks/:blockKey/reset` | 還原該租戶此塊為預設 | security_admin |

- 每筆寫入 → `appendAuditLog({action:'dashboard-block-update', tenantId, actorIp, metadata:{blockKey, fields:[...]}})`。
- **讀端點不需要全表回傳機密**：settings 內不含 keyHash／raw 資料（機密資料仍走原模組讀取＋既有遮罩）。

---

## 5. UI（後台新增「版面設定」，線框）

```
/admin/layout  ─ 版面設定（自訂區域）
┌─────────────────────────────────────────────┐
│ 我的後台    [版面設定]  [預覽]  [還原預設]      │
├─────────────────────────────────────────────┤
│ ☰ 區塊清單（依 position 排序）                 │
│ ┌─ 營運總覽 ──────────────── [⬆][⬇][⚙][⛔] ─┐
│ │ 已啟用・副標：最近 7 天…                    │
│ └──────────────────────────────────────────┘
│ ┌─ 最新報告 ────────────────── [⬆][⬇][⚙][⛔]┐
│ │ 已停用（保留資料）                        │
│ └──────────────────────────────────────────┘
│ ...（停用者以半透明呈現）                     │
└─────────────────────────────────────────────┘
[⚙] → 抽屜：依該 block schema 產生的表單（標題/筆數/顏色…）
     底部：[儲存並套用] [還原此塊]
[⛔] = 停用／啟用切換
```

- 既有各頁（/admin/overview 等）改為「讀同一份 blocks 設定」渲染，或保留原路由並新增 `/admin/layout` 主控——**採後者**（改動面最小）：6+1 頁面結構不動，新增一個版面頁控制「首頁儀表板（自訂區域）」的區塊。
- 實際渲染的「自訂首頁」：`/admin`（或新 `/admin/dashboard`）依 blocks 依序渲染啟用區塊。

---

## 6. 安全原則（對應 code review 慣例）

1. 任何寫入僅接受**白名單欄位**：zod `.strict()`；未知鍵拒絕；字串設長度上限（如 120），防止大 payload。
2. 不儲存、不渲染原始 HTML：文字以純文字輸出（React 預設 escape）；「富文字」需求留待未來（需 sanitizer）。
3. 全部查詢以 `tenant_id` 過濾（沿用 risk-postgres 慣例）。
4. 寫入限 `security_admin`；其餘角色依既有 `x-role`／`roleOfRequest` 規則。
5. 全操作寫 audit（含 actor）。

---

## 7. 里程碑拆解（約 1–2 人週）

| 步驟 | 內容 | 產出 |
|---|---|---|
| M1 | block registry＋zod schema 定義（overview/reports/events/devices/review/homepage 等 6–7 塊）＋單元測試 | packages/web? 純 TS 定義＋測試 |
| M2 | DB 遷移（`dashboard_blocks` 表）＋ repository 方法（get/upsert/reset，tenant 過濾）＋ PG 整合測試 | repository 層 |
| M3 | API 三端點＋驗證＋audit＋server 測試 | apps/api |
| M4 | UI：/admin/layout 版面頁（排序/啟停/設定抽屜）＋「自訂首頁」渲染  | web-scanner |
| M5 | E2E（版面 CRUD、權限 403、未授權 401）＋CI 全綠＋正式庫 init-db | 驗收 |

> 前置：與 M1 平行進行「管理登入／RBAC 完整化」安全墊底（見意向頁③）——至少完成「版面寫入需 security_admin」的既有規則驗證即可先上。

---

## 8. 驗收清單（DoD）

- [ ] 新租戶預設即有全部區塊且可顯示（無手動設定時）
- [ ] 停用→首頁消失、資料保留；再啟用→恢復
- [ ] 順序調整即時反映
- [ ] 設定非法值被 400 拒絕且不寫入
- [ ] 非 security_admin 寫入 403
- [ ] audit 有 dashboard-block-update 記錄
- [ ] CI（Build/Typecheck/Unit/test:postgres/verify/E2E）全綠
- [ ] 正式庫套用後不影響既有 6+1 頁

---

*本文件為取捨用草案；批准後我會先做 M1（registry＋schema）讓您看實際可設定欄位清單，再逐層往下。*
