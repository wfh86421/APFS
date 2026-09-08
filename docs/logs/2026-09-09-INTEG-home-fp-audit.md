# 2026-09-09 INTEG 窗口：首頁設備指紋「完整性／真實性」稽核與修正（代號 INTEG）

- **目標**：把護城河（設備指紋）在首頁（掃描總覽）的呈現做「完整性＋真實性」稽核：哪些欄位顯示 —（其實已能採集）、哪些取值可能與真實本機不一致，逐列修正並附實測。
- **稽核發現（對照 home-overview-v2 顯示列 vs browser-sdk 訊號 vs 真實 Navigator）**：
  - **完整性缺口**：W1 已新增 fonts／clientRects／mediaDevices 採集並落庫，但首頁硬體卡「Client Rects」「媒體設備」與軟體卡「字體」「字體列表」仍是 `—`（未接上新訊號）；「WebGL Report」恆為 —（其實可取 GL vendor/renderer 組合）；「郵政編碼」恆 —（ip-api 有 zip、GeoIpInfo.postalCode 已存在）；「端口檢測」恆 —（W4 後 report.issues 帶 unusual_open_ports 時可顯示真實開放端口）。
  - **真實性問題**：Flash／ActiveX／Java 顯示空白 `—`（語意含糊：實際是「現代瀏覽器不支援」的事實值，非缺資料）；硬體卡 note 聲稱「未採集或需權限」已過時（W1 後可採集）。
  - **已正確（未改）**：OS 顯示優先序 clientHints.platform → navigator.platform → UA 推估（實測 uaDataPlatform=Windows 正確勝過 legacy Win32）；設備內存／邏輯處理器核心取自已授權 Navigator 真值；Canvas/WebGL/Audio/WebGPU hash 為即時實測。
  - **誠實保留 `—`**：隱身模式、設備型號（瀏覽器端無法可靠量測／需 server Client Hints model，未做不硬湊）。
- **關鍵決策／修正**：
  1. 硬體卡：`Client Rects` ← clientRects 訊號 hash 前 8 碼；`媒體設備` ← mediaDevices 訊號（麥克風×n、鏡頭×n、喇叭×n、曾授權標記；不取流）；`WebGL Report` ← webgl vendor＋renderer 組合（真實字串）；note 改寫為實測說明。
  2. 軟體卡：`字體`＝已偵測數、`字體列表`＝保守測寬偵測清單（截 120 字）＋note 標明「估算子集、非完整清單」；`端口檢測` ← report.issues unusual_open_ports evidence（W4 接線，未執行 port-scan 顯示 —）；Flash/ActiveX/Java → 事實值「不支援」。
  3. 地理位置卡：`郵政編碼` ← geo.postalCode（ip-api zip）；note 標明來源。
- **實測（本機 headless Chromium 直接執行 build 後 SDK 模組，127.0.0.1 secure context）**：fonts 偵測 20/40（Arial/Segoe UI/Noto Sans TC/SimSun/新細明體/標楷體/Yu Gothic/Consolas/Georgia…）hash 穩定；clientRects {1 rect, 1230×55}；mediaDevices {audio×1, video×1, audio×1, labeled 0}；webgl SwiftShader（headless）真實；與 __truth（navigator/uaData/screen）交叉比對一致——新模組在真實瀏覽器可正常執行、輸出為真值。
- **改動檔案（commit 前綴）**：`apps/web-scanner/src/components/home-overview-v2.tsx`（helpers：fontsSummaryLabel/fontsListLabel/mediaDevicesLabel/webglReportLabel/openPortsLabel＋上述欄位接線與 note）；本檔。
- **驗證結果**：web-scanner typecheck ✅（tsc EXIT=0）；瀏覽器實測如上述。首頁新版需 **VPS 試用站重建部署** 後才看得到（W1 亦同批未部署）。
- **未完成/待辦**：
  - VPS 部署（web 映像重建，NEXT_PUBLIC_EXPERIENCE=overview）後，使用者在真實本機複掃對照（尤其 fonts 清單、媒體裝置數、WebGL Report、郵政編碼）——此沙箱無 SSH（密碼在舊對話）。
  - 設備型號（sec-ch-ua-model 經 server）與隱身模式偵測列為未來模組，本包不硬湊。
- **給其他 agent 的備註**：首頁顯示規則＝「有真實訊號就顯示、量不到就誠實 —／不支援」，禁止以推估值冒充實測；任何「—」行都須在卡片 note 說明原因。
