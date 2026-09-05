# ShieldScan 管理者工作台 — 結構模板提示詞

> 用法：把本文件「整段內容」貼給 Codex（或其他能寫 Next.js 的 AI），並指定目標專案資料夾。
> 產出結果應與目前 `/admin` 具有相同的結構、互動與可擴充性。

---

## 任務目標

在指定專案內建立一個「管理者工作台」（KPanel 風格管理介面），具備：

1. 模組／素材管理：管理者可對每個功能模組「啟用／停用」、「顯示／隱藏」、「上移／下移排序」。
2. 三區框架：左側全高導覽欄（含商標區、收合控制）、中間區（頂部橫條＋內容）、內容區。
3. 左下狀態列：Agent 線上＋「更新可用」按鈕、admin 使用者卡＋登出小圖示。
4. 中間頂部橫條：麵包屑 + Agent 線上 + 介面語言（繁/EN）+ 進入桌面模式 + 明暗模式。
5. 主題：淺色／深色／跟隨系統三態，使用 CSS 變數，選擇需持久化。

## 技術條件

- Next.js App Router + TypeScript（strict / noUncheckedIndexedAccess 要能通過）。
- 管理頁入口：`/admin`；其他功能頁以 `/admin/overview`、`/admin/modules`、`/admin/settings` 預留。
- 不依賴後端即可運作：設定先存 `localStorage`；儲存層與 UI 解耦，未來可換成 API。
- 全程不得使用 `any`、不得關閉型別檢查。

## 版面結構（以此為準）

```text
┌──────────┬──────────────────────────────────────────────┐
│  左欄     │  中間區頂部橫條（無商標）                      │
│ (全高)    │  麵包屑           Agent 線上 繁 ⛶ ☀/🌙/🖥   │
│          ├──────────────────────────────────────────────┤
│ 商標區    │                                              │
│ 🛡       │                內容區                         │
│ ◂收起    │   分類清單 / 模組開關 / 右側預覽               │
│ ...導覽   │                                              │
│          ├──────────────────────────────────────────────┤
│ Agent    │                                              │
│ 線上 更新 │                                              │
│ admin ⎋  │                                              │
└──────────┴──────────────────────────────────────────────┘
```

### 左側導覽欄（全高、與頂部橫條分離）

- 商標區與下方導覽項目**明顯分開**（分隔線或獨立色塊）。
- 商標：漸層圓角方塊內的 **SVG 盾牌**（不要用 emoji，避免部分環境空白）。
- 導覽項目至少包含：管理者工作台（啟用）、管理概覽、模組市場、設定（後三者可標「規劃中」）。

#### 側欄三態（2026-09-05 定版）

- **收合（預設、未 hover）＝ 圖2**：寬約 48px 的直立圖示欄；頂部顯示「盾牌商標」；功能圖示列置中；底部只有 avatar（置中）。
- **hover 商標 ＝ 圖3**：盾牌原位換成「側欄面板圖示」，並在右側浮出文字「展開側欄」；點擊後展開。
- **展開 ＝ 圖1**：寬約 240px；頂部為「盾牌＋ShieldScan 文字＋右側固定面板圖示」；導覽顯示完整文字與「規劃中」徽章；底部「Agent 線上＋更新可用」與「admin／管理者＋登出」。
- 收合時**不要**把商標隱藏成空白、**不要**在底部放左右移動（◂／▸）欄位。

#### 左下（圖1／圖2 定版）

- 收合時只保留 avatar（置中）。
- 展開時：
  - 第一行：「Agent 線上」＋右側黃色「更新可用」按鈕。
  - 第二行：admin 使用者卡，右側「⎋ 登出」小圖示。

### 中間區頂部橫條

- 無商標。左側為麵包屑「控制台 / 目前頁名」。
- 右側依序：`Agent 線上` chip、介面語言按鈕（繁／EN）、進入桌面模式按鈕、明暗模式按鈕、回到網站、admin 圖示。
- 語言按鈕與明暗按鈕需反映目前狀態，並持久化。

## 模組資料模型

```ts
export type ModuleKind =
  | 'detection' // 採集/偵測
  | 'analysis'  // 分析
  | 'scoring'   // 評分
  | 'policy'    // 政策
  | 'output';   // 輸出

export interface ModuleCategory {
  id: string;      // 例如 'browser'
  label: string;
  icon: string;
  order: number;
  visible: boolean;
  collapsed: boolean;
}

export interface ModuleItem {
  id: string;           // 例如 'browser.canvas'
  categoryId: string;
  label: string;
  icon: string;
  description: string;
  kind: ModuleKind;
  enabled: boolean;     // 功能是否參與
  visible: boolean;     // UI 是否顯示
  order: number;        // 分類內排序
}
```

### 預設目錄（範例）

- 綜合評分：總分與風險等級、四維評分。
- 瀏覽器與隱私：User-Agent、Client Hints、Canvas、WebGL、WebGPU、Audio、螢幕、語言、時區、WebRTC（採集 id 對應 browser-sdk plugin id）。
- 網路環境：出口 IP／網路分析。
- 報告輸出：檢測報告明細、JSON 匯出。

## 管理頁互動

- 分類可：收合／展開、顯示／隱藏、上移／下移。
- 模組可：啟用／停用、顯示／隱藏、上移／下移。
- 右側「工作台預覽」只呈現「分類可見＋模組顯示」的卡片；停用卡片虛線並標「已停用」。
- 提供「還原預設」。
- 所有變更即時寫入 `localStorage`（key 需版本化，例如 `shieldscan.admin.workspace.v1`）。

## 狀態與偏好

- 明暗模式：`light | dark | system`，系統模式需聆聽 `prefers-color-scheme` 變化。
- 語言：`zh-TW | en-US`（MVP 內容仍以中文為主，EN 標示為規劃中）。
- 桌面模式：按鈕以 Fullscreen API 切換全螢幕。
- 登出／更新可用：尚未串接後端，點擊給出提示或回到首頁即可。
- 偏好 key：`shieldscan.admin.theme`、`shieldscan.admin.lang`。

## 視覺主題

定義同一組 CSS 變數（例如 `--bg / --card / --card-2 / --border / --text / --muted / --accent / --good / --warn / --bad`）。

- 深色為預設。
- 淺色用 `html[data-theme='light']` 覆寫同一組變數。
- `system` 時依使用者系統偏好解析成 light/dark 並寫到 `<html data-theme>`。
- 未來「自訂配色」只需替換變數，即可同時產生淺色與深色版本。

## 驗收標準

1. `pnpm --filter <web-app> build` 零錯誤。
2. `/admin` 可開啟，三個區塊位置正確。
3. 側欄三態符合定版：收合＝盾牌置中；hover＝面板圖示＋「展開側欄」；展開＝盾牌＋ShieldScan＋右側面板圖示。
4. 頂部橫條無商標；語言／桌面／明暗按鈕都在頂部。
5. 左下收合只留 avatar；展開只有 Agent 線上＋更新可用＋admin＋登出。
6. 啟停／顯示／排序即時反映在預覽，重整後仍保留。
7. 明暗模式三態可切換且會記住；跟隨系統時會自動變化。

---

> 產生完成後，請用上述 7 條驗收標準逐項自檢，再交付。
