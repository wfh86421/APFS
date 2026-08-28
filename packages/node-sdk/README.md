# @shieldscan/node-sdk

後端驗證 SDK。收集 Server-side（L0/L1）訊號作為信任錨點：

- HTTP headers（UA、Accept-Language、Client Hints）
- TLS JA4/JA3、HTTP/2 SETTINGS、TCP 指紋（由反向代理/WAF 提供）
- SDK 上報完整性驗證（nonce + timestamp + signature）

高價值客戶會把它放在登入、註冊、支付、播放、下單流程，與前端 SDK 上報交叉比對。
