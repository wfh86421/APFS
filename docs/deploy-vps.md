# VPS 上線指南（本地鏡像驗證 → 終端 VPS）

## 0. 流程總覽

```text
本機：docker compose up -d --build
      → node scripts/smoke-compose.mjs（全數 ✔）
      → 確認無誤
VPS：git clone → .env → docker compose build/up → 冒煙 → Caddy HTTPS → 備份排程
```

## 1. 本機鏡像驗證（先做）

需要本機安裝 Docker Engine + compose plugin（Docker Desktop 即可）。

```bash
# 1) 複製環境變數
cp .env.example .env
# 編輯 .env：POSTGRES_PASSWORD、REPORT_SIGNING_SECRET 換成正式隨機值

# 2) 建置並啟動（Postgres/Redis/API/網站）
docker compose up -d --build

# 3) 冒煙測試（網站 200、匿名報告、租戶簽章報告、Postgres 落庫）
node scripts/smoke-compose.mjs
# 期望輸出：=== docker compose 冒煙：5/5 通過 ===

# 4) 手動檢查
# 網站：http://localhost:3000（掃描 → standard/stored 上傳 API）
# API：http://localhost:3001/health
# 結束：docker compose down
```

## 2. VPS 前置

- Ubuntu 22.04+（或 Debian 12+），至少 2 vCPU / 2GB RAM。
- 安裝 Docker Engine 與 compose plugin：

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # 重新登入生效
docker compose version          # 確認可用
```

- 網域 DNS A 紀錄指向 VPS IP（例如 `shieldscan.example.com`、`api.shieldscan.example.com`）。
- 防火牆：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

## 3. 首次部署

```bash
git clone git@github.com:wfh86421/APFS.git
cd APFS
cp .env.example .env
nano .env   # 填正式值，見下方「上線檢查清單」
./scripts/deploy-vps.sh
```

`deploy-vps.sh` 會執行：git pull → compose build → up -d → 等 API 就緒 → 冒煙測試 → ps。

## 4. 上線檢查清單（必填）

| 項目 | 正式值 | 備註 |
|---|---|---|
| `POSTGRES_PASSWORD` | 強密碼 | 不要用預設 `shieldscan` |
| `REPORT_SIGNING_SECRET` | `openssl rand -hex 32` 產生 | 簽章驗證用，洩漏=簽章可偽造 |
| `NETWORK_PROVIDER` | `ip-api`（或自建 GeoIP） | mock 只適用開發 |
| `CORS_ORIGIN` | `https://shieldscan.example.com` | 網站來源 |
| `NEXT_PUBLIC_API_URL` | `https://api.shieldscan.example.com` | build 時內嵌，改後要重建 |

## 5. 反向代理 + HTTPS（Caddy）

```bash
sudo apt install caddy
sudo cp infra/caddy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile   # 填入網域
sudo systemctl reload caddy
```

Caddy 自動簽發/續期 Let's Encrypt 憑證。

## 6. 只允許本機存取資料庫（VPS 安全）

正式環境不要讓 Postgres/Redis 對外。建立 `docker-compose.override.yml`：

```yaml
services:
  postgres:
    ports: ["127.0.0.1:5432:5432"]
  redis:
    ports: ["127.0.0.1:6379:6379"]
```

（docker compose 會自動合併 override。）

## 7. 備份（pg_dump + cron）

```bash
mkdir -p ~/backups
crontab -e
# 每天 03:00 備份
0 3 * * * docker exec $(docker compose -f ~/APFS/docker-compose.yml ps -q postgres) pg_dump -U shieldscan shieldscan | gzip > ~/backups/shieldscan-$(date +\%F).sql.gz
```

建議每週把備份檔異地同步（rclone / rsync）。

## 8. 更新上線

```bash
cd ~/APFS
./scripts/deploy-vps.sh
```

## 9. 監控與日誌

```bash
docker compose logs -f api
docker compose logs -f web
curl -fsS http://127.0.0.1:3001/health
```

後續可接 Prometheus + Grafana（infra/ 規劃中）。

## 10. KPanel 控制台部署（Web 終端）

如果 VPS 用的是 KPanel 這類 Web 管理面板（例如 `http://<VPS-IP>:8080/docker`），
KPanel 提供網頁終端（Docker 控制台頁面可找到 terminal），不需要本機 SSH 金鑰也能部署：

1. 登入 KPanel → Docker 控制台，確認 Docker 正常運作。
2. 開啟 KPanel 網頁終端（或從本機 SSH 連入）。
3. 安裝 git 並複製專案（公開 repo 可直接 https clone）：

```bash
apt install -y git
cd /root
git clone https://github.com/wfh86421/APFS.git
cd APFS
cp .env.example .env
nano .env
# POSTGRES_PASSWORD / REPORT_SIGNING_SECRET 換成正式值
# NEXT_PUBLIC_API_URL 先填 http://<VPS-IP>:3001（測試期）或正式網域
```

4. 部署 + 冒煙：

```bash
./scripts/deploy-vps.sh
curl http://127.0.0.1:3001/health
```

5. 瀏覽器驗證：`http://<VPS-IP>:3000`（掃描 → 報告 → JSON 匯出）。
   若在本機驗證 API，可用 `API_URL=http://<VPS-IP>:3001 node scripts/smoke-compose.mjs`。
6. 正式上線前：
   - 用 Caddy 反代 80/443（第 5 節），`.env` 的 `CORS_ORIGIN` 與 `NEXT_PUBLIC_API_URL` 改為正式網域後重建。
   - 資料庫/Redis 只綁 `127.0.0.1`（第 6 節）。
   - 管理面板（8080）改為僅本機存取或 SSH 隧道，不要直接暴露公網。

> KPanel 的 Docker 頁面可看容器/映像，但沒有 compose 堆疊 UI；
> 請用網頁終端跑 `deploy-vps.sh`，一次建立 Postgres/Redis/API/網站四個服務。
