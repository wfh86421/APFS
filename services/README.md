# 獨立服務

| 服務 | 說明 | 建議語言 |
|---|---|---|
| `ingestion-api` | 報告收錄 API（可與 apps/api 合併） | Node.js / Go |
| `scanner-service` | 端口掃描（僅掃自身來源 IP、限流、審計） | Go / Rust |
| `dns-stun-service` | DNS 誘捕域名 + 多區域 STUN 節點 | Go / Rust |
| `reputation-service` | IP/ASN/Proxy/VPN/Tor/Hosting 信譽查詢 | Python / Go |

法務與濫用風險高：掃描服務必須隔離部署、隔離權限、留下審計紀錄。
