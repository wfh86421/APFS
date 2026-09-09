# Competitive Field Gap — ShieldScan vs BrowserScan（對齊工作包總表）

> 日期：2026-09-09（INTEG）
> 比對基準：同一設備/瀏覽器開啟 browserscan.net/tc 與 ShieldScan 試用站 :3080（IP 43.252.167.96、UA Chrome/152、Brave）。
> 目的：逐欄位解釋「為何競品能掃到、我們不能」，並規劃修正工作包（全部以「真值優先、誠實標示」為原則）。

## 0. 比對結論（同機仍見差異）
- 競品站為 **HTTPS**，我們為 **plain http** → `deviceMemory / enumerateDevices / WebGPU / crypto 高熵` 等安全連線 API 我方全被封鎖（部分已用純 JS fallback 解掉 hash，但記憶體/媒體仍無解）。**HTTPS 是最大單一差距**。
- 競品用「瀏覽器原生 API＋heuristic」，我們多數只用「UA 解析＋確定值」。
- 同機卻出現 screen 1680×1050 vs 2560×1440、cores 2 vs 4：疑為縮放(DPR)/多顯示器/VM 或視窗差異 → 我方 screen 訊號需補 DPR/outer 尺寸以可除錯（W-BS7）。

## 1. Gap 矩陣（競品有 → 我們缺）
| # | 欄位/能力 | 競品機制 | 我方根源 | 解方 | 工作包 |
|---|---|---|---|---|---|
| 1 | 瀏覽器＝Brave | `navigator.brave.isBrave()`＋brands | 僅解析 UA（Brave UA=Chrome 串） | browser-api 偵測層（brave/edge/opera/vivaldi…） | W-BS1 |
| 2 | 記憶體真值 | HTTPS 下 `navigator.deviceMemory` | 站為 http | 上 HTTPS；http 下續顯示「僅 HTTPS 可得」 | W-BS2 |
| 3 | 媒體裝置真數＋授權按鈕 | HTTPS＋`enumerateDevices`＋可要求權限 UI | http 封鎖；無權限流程 | HTTPS＋權限按鈕（enumerate→label 後才有意義） | W-BS2 |
| 4 | WebRTC 真公網（IP 位址不同 -10） | 以 STUN candidate「映射位址」為真公網 | 我們把映射 IP 當 localIps、server publicIp＝http IP | webrtc 模組回傳 mappedPublicIp；server 用其比對 | W-BS3 |
| 5 | 時區名稱不同即扣 -10 | 規則看時區名稱（不看 offset） | 我們只看 offset（+8=+8 不扣） | 環境規則：名稱不同即扣（offset 佐證） | W-BS4 |
| 6 | Canvas 異常/竄改拆分 | disabled 與 tampered 兩條獨立權重（-5/-10） | 只有 tamper -5(info) | 拆兩規則＋狀態字（同 UNSTABLE 呈現） | W-BS5 |
| 7 | DNS Leak 真值 | 伺服器獨立 DNS 解析比對 | SDK/server 皆無 DNS 探測 | server 端 DNS 一致性檢查＋洩漏清單 | W-BS5 |
| 8 | 插件清單 | `navigator.plugins`（PDF viewer 等） | 未採集 | plugins 模組（name/desc/filename） | W-BS5 |
| 9 | 字體全列表（93） | 較激進全量枚舉 | 保守 40 候選（17 命中） | 擴候選池；或明確標「常用子集」 | W-BS5 |
| 10 | 隱身模式推測 | storage/quota heuristic | 拒絕不穩偵測 | 回「推測值＋方法」或維持誠實「無法可靠偵測」 | W-BS5 |
| 11 | 端口 22 開放 | 伺服器掃來源 IP 並回填 | 有 API、前端未觸發 | 「進階掃描」按鈕＋限流提示＋回填顯示 | W-BS6 |
| 12 | 螢幕/核心差異除錯 | 多訊號交叉 | 我們只報 screen.width | screen 訊號補 `devicePixelRatio/outerWidth/scale`；跨站同機再驗 | W-BS7 |

## 2. 競品能、我們不能的三個總根因
1. **傳輸層（http vs https）**：安全連線 API 差（記憶體/媒體/WebGPU/crypto 高熵）。→ 上 HTTPS 優先。
2. **訊號採集深度**：競品呼叫瀏覽器原生能力（isBrave、plugins、RTCPeerConnection 映射位址、fonts 枚舉、DNS 解析），我們多停在 UA/確定值。
3. **規則模型**：競品權重/拆分（時區名、canvas 雙規則、IP 不同 -10）更貼 whoer 系；我們偏保守、同 offset 不扣。

## 3. 修正原則（專業度）
- 能拿原生 API 就不猜；拿不到標「原因」而非空 —。
- heuristic 值（隱身模式）標「推測＋方法」，不冒充確定值。
- 所有新訊號進 device_fingerprints 前先確認 hash 穩定（護城河資料品質紅線）。

## 4. 工作包規劃（對齊 BrowserScan）
| 包 | 內容 | 檔案範圍 | 驗證 |
|---|---|---|---|
| **W-BS1 瀏覽器真名** | browser-api 偵測（brave/edge/opera/vivaldi/arc…）＋ brands 比對 | browser-sdk（新 module 或併 ua）、首頁 browserLabel | 單測＋headless（Brave UA 情境） |
| **W-BS2 HTTPS＋安全 API** | 部署 HTTPS（Caddy/正式網域）或維持 http 誠實標示；權限按鈕 UI | infra/caddy、web | 瀏覽器實測 |
| **W-BS3 WebRTC 映射位址** | webrtc 模組回 mappedPublicIp；server webrtc_ip_mismatch 以映射位址判定 | browser-sdk webrtc、server | 單測＋實測洩漏案例 |
| **W-BS4 時區名稱規則** | 環境規則：名稱不同即扣（offset 佐證、防誤報：僅 IANA 區不同且已知） | server（environmentalCoherence）＋規則測試 | 規則單測 |
| **W-BS5 採集擴充** | canvas disabled/tamper 拆規則；plugins 模組；DNS server 檢查；字體池擴充；隱身 heuristic 標示 | browser-sdk、server、scoring-engine | 各自單測＋typecheck |
| **W-BS6 端口掃描 UI** | 「進階掃描」按鈕（限流 5/時提示）→ /v1/port-scan → 回填首頁＋risk event | web＋已有 API | E2E/headless |
| **W-BS7 screen 除錯** | screen 訊號補 `devicePixelRatio/scale/outerWidth`；跨站同機複測 1680 vs 2560 | browser-sdk screen、首頁 | 實測 |

## 5. 資料品質與既有紅線
- 新指紋一律走 `src/sha.ts`（勿直用 crypto.subtle，http 會斷）。
- devices/rule 相關改動仍守「本機綠 ≠ CI 綠」；schema 異動僅 infra init.sql。
- 試用站＝備用站禁關；正式站改版先試用站驗證。
