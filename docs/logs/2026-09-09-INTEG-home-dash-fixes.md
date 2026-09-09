# 2026-09-09 INTEG 窗口：首頁「—」欄位真實來源修正（郵政/IP 7 天/WebGPU/記憶體/隱身/型號/DNT）（代號 INTEG）

- **目標**：使用者回報多欄仍為「—」，逐欄找出**真實來源或誠實說明**並接上。
- **修正**：
  1. **郵政編碼**：hero 摘要列原寫死 DASH → 接 `geo.postalCode`（ip-api zip；該來源無值才顯示 —，Location 卡已接）。
  2. **IP 計數（7 天）**：新增 repository 方法 `countPublicReportsByClientIp(ip, since)`（PG/in-memory；**僅算匿名 tenant NULL 公共資料、不跨租戶**）；`/v1/reports`（匿名）回傳 `ipCount7d`（含本次）→ 首頁顯示「n 次（近 7 天公開掃描）」，仍保留 server_ip_velocity 異常提示。
  3. **WebGPU Report**：顯示 adapter vendor/device/architecture 真實值；不支援時退回 hash 前 8 碼／—。
  4. **設備內存**：有值顯示 GB；無值且非安全連線顯示「僅 HTTPS 可得」（deviceMemory 在 http 不暴露）；否則「未暴露」。
  5. **隱身模式**：瀏覽器不可靠偵測 → 誠實文字「無法由瀏覽器可靠偵測」。
  6. **設備型號**：node-sdk 補抓 `sec-ch-ua-model`；`/v1/reports` 回傳 `deviceModel`（去引號）；行動版 Chrome/Android 有值即顯示，桌面顯示「未提供（瀏覽器未回報型號）」。
  7. **Do Not Track**：`navigator.doNotTrack` 缺失（Chrome 已移除）顯示「未提供（瀏覽器未實作）」取代 —。
  8. **端口檢測**：維持「先跑合規 port-scan 才會有值」（W4 接線已在），note 已說明；不自動掃避免限流。
- **改動檔案（commit 前綴）**：`packages/node-sdk/src/index.ts`、`packages/repository/src/{types,postgres,in-memory}.ts`、`apps/api/src/server.ts`、`apps/web-scanner/src/lib/api.ts`、`apps/web-scanner/src/components/home-overview-v2.tsx`、本檔。
- **驗證結果**：repository/node-sdk build ✅、api typecheck+build ✅、web typecheck ✅。部署後 headless 實測見後續（IP 計數有值、型號/DNT/記憶體/隱身為誠實說明文字）。
- **未完成/待辦**：正式站同批待部署；郵政編碼對「供應商無 zip 的 IP（如行動網路）」仍顯示 —（資料庫無此值，無法偽造）。
