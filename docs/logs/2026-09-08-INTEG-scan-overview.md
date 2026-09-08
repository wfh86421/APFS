# 2026-09-08 INTEG 窗口：掃描總覽 ↔ admin/layout 整合（代號 INTEG）

- **目標**：把「掃描總覽首頁」區塊整合進 /admin/layout，管理者可對總覽頁各區塊做 排序/停用 等設定，並即時影響 overview 首頁渲染。
- **關鍵決策**：
  - core-schema registry 新增 AdminPageKey `scan-overview`（中文『掃描總覽』，icon 📡，route `/`）＋8 區塊（ov.toolbar/hero/issues/ip/location/hardware/browser/software，全 defaultEnabled）；原 `overview` key 已是管理 KPI 頁，故不用以免撞 localStorage。
  - 共用事實來源＝localStorage `ss.layout.v1.scan-overview`；編輯器與首頁讀取同一 key；dashboard API（M3）同步沿用既有函式，未動 server。
  - home-overview-v2 以 CSS `order`＋停用 `display:none` 依 layout 渲染；讀不到設定＝全部預設（與原行為一致）；掃描進度條置頂不因設定消失。
  - 編輯器 loadLayout 的 order merge 改「儲存順序優先」+剔除下架+新塊補尾（修跨 reload 排序遺失）。
- **改動檔案**：`packages/core-schema/src/dashboard-blocks.ts`、`apps/web-scanner/src/components/admin/block-layout-editor.tsx`、`apps/web-scanner/src/components/home-overview-v2.tsx`、`docs/logs/2026-09-08-INTEG-scan-overview.md`（本檔）。
- **驗證**：受影響檔 typecheck EXIT=0（臨時 tsconfig 對映 pnpm store）；classic/E2E 路徑不動。
- **待辦**：試用站判讀（/admin/layout『掃描總覽』→ :3080 首頁即時生效）；正式站合併與部署（等使用者驗收）。
