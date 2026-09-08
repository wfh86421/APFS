# 2026-09-09 INTEG 窗口：plain-http 指紋失效修正（crypto.subtle fallback）（代號 INTEG）

- **目標**：部署 W1＋首頁真實性修正到備用站（:3080）後的驗收發現——**試用站走 plain http，非安全連線**下 `crypto.subtle`／`mediaDevices` 不存在，導致 Canvas/WebGL/Audio/WebGPU/ClientRects/Fonts 全部 hash 拿不到（首頁顯示 —）、媒體裝置「不支援」。這正是「有些數據跟真實本機不一致／拿不到」的根因之一。修正後重部署並驗收。
- **關鍵決策**：
  - 新增 `packages/browser-sdk/src/sha.ts`：`sha256()` 優先 `crypto.subtle`，不可用（plain-http）時退回**純 JS SHA-256 實作**（FIPS 180-4，TextEncoder 取 UTF-8 位元組）；同字串在 http/https 產出相同 hash → 指紋聚類不受部署方式影響。
  - 8 個模組（canvas/webgl/webgpu/audio/webrtc/fonts/clientRects/mediaDevices）刪除各自本機 `crypto.subtle` sha256，改共用 `sha256`。
  - mediaDevices：`window.isSecureContext === false` 時回 `{supported:false, reason:'insecure-context'}`；首頁顯示「僅 HTTPS 可用」（誠實，不再誤稱「不支援」）。
  - 首頁「資料來源」footer 更新為 13 個採集模組（含 字體/Client Rects/媒體裝置）。
- **驗證**：
  - browser-sdk build ✅；純 JS 實作與 Web Crypto 結果**逐字元一致**（空字串/1/abc/43/200/中文 emoji×100 全數相同；`sha256('abc') = ba7816bf…` 符合已知向量）。
  - web-scanner typecheck ✅。
  - 重部署備用站後 headless Chromium 於 :3080 重掃（見部署後續：hash 行、字體、footer 13）。
- **改動檔案（commit 前綴）**：`packages/browser-sdk/src/sha.ts`（新增）、8 個 modules 檔、`home-overview-v2.tsx`、本檔。
- **未完成/待辦**：正式站（:3000）同樣 plain http → 同樣修正待正式站下次部署一併生效；長遠建議上 HTTPS（Caddy）讓 mediaDevices 真正可用。
- **給其他 agent 的備註**：任何「指紋 hash」一律經 `src/sha.ts` 的 `sha256`（勿再直接呼叫 `crypto.subtle`）；mediaDevices 值含 `reason:'insecure-context'` 時為非安全連線限制、非裝置問題。
