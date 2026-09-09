# 2026-09-09 INTEG 窗口：對齊 BrowserScan 第一包（trial-first）（代號 INTEG）

- **目標**：依「每次改動先上備用站實測」原則，對齊 BrowserScan 第一包：瀏覽器真名／WebRTC 映射位址／時區名稱規則／核心與記憶體專業標示。**僅推分支到備用站，main 與正式站不動，待使用者確認後才合 main。**
- **改動**：
  - `packages/browser-sdk/src/modules/webrtc.ts`：回報 `mappedPublicIp`（STUN srflx 反射的全球單播 IPv4，排除私網/環回/鏈路本地位址）。
  - `apps/web-scanner/.../home-overview-v2.tsx`：`detectBrowserBrand()`（`navigator.brave.isBrave()`→Brave；UA 標記 Edge/Opera/Vivaldi/Samsung/Firefox）＋hero/瀏覽器卡顯示真名（「Brave 152.0.0.0」）；WebRTC 列優先顯示映射公網；「邏輯處理器核心」→「處理器核心（邏輯）」；記憶體註記 Chrome 2 的次方粗估。
  - `apps/api/src/server.ts`：時區規則改「名稱不同即扣」（同 offset 如 Asia/Taipei vs Asia/Hong_Kong 也扣；offset 列入證據）。
- **驗證**：browser-sdk build ✅、api typecheck ✅、web typecheck ✅。
- **未完成/待辦**：備用站部署＋使用者實測（Brave 顯示、時區扣分、WebRTC 列、處理器/記憶體標示）；通過後才合 main。
