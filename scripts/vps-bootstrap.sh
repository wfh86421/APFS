#!/usr/bin/env bash
#
# ShieldScan VPS 一次性引導（KPanel 網頁終端 / SSH 皆可）
#
# 用法：把本腳本內容整段貼到終端後按 Enter，會自動：
#   1. 檢查 Docker（未安裝則提示安裝方式）
#   2. 安裝 git（若缺）
#   3. clone https://github.com/wfh86421/APFS
#   4. 產生 .env（自動偵測公網 IP、隨機 POSTGRES_PASSWORD / REPORT_SIGNING_SECRET）
#   5. 執行 ./scripts/deploy-vps.sh（build → up → 冒煙）
#
# 可選環境變數覆寫：
#   PUBLIC_IP     自動偵測失敗時手動指定
#   GIT_REPO_URL  私人 repo 用（例如 https://<TOKEN>@github.com/wfh86421/APFS.git
#                 或 git@github.com:wfh86421/APFS.git + deploy key）

set -euo pipefail

echo "[bootstrap] 開始 ShieldScan VPS 引導"
GIT_REPO_URL="${GIT_REPO_URL:-https://github.com/wfh86421/APFS.git}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[bootstrap] Docker 未安裝。請先安裝："
  echo "  curl -fsSL https://get.docker.com | sh"
  echo "  或在 KPanel 的 Docker 控制台安裝後重跑本腳本。"
  exit 1
fi

PUBLIC_IP="${PUBLIC_IP:-$(curl -4 -s --max-time 8 ifconfig.me 2>/dev/null || true)}"
if [ -z "$PUBLIC_IP" ]; then
  PUBLIC_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
if [ -z "$PUBLIC_IP" ]; then
  echo "[bootstrap] 無法自動偵測公網 IP，請用 PUBLIC_IP=1.2.3.4 重跑。"
  exit 1
fi
echo "[bootstrap] 公網 IP：${PUBLIC_IP}"

command -v git >/dev/null 2>&1 || { apt-get update -y && apt-get install -y git; }

cd /root
if [ ! -d APFS ]; then
  echo "[bootstrap] git clone …"
  git clone "$GIT_REPO_URL"
fi
cd APFS
git remote set-url origin "$GIT_REPO_URL" || true
git pull --ff-only || true

if [ ! -f .env ]; then
  echo "[bootstrap] 產生 .env（隨機密鑰 + 公網 IP）…"
  cp .env.example .env
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 16)/" .env
  sed -i "s/^REPORT_SIGNING_SECRET=.*/REPORT_SIGNING_SECRET=$(openssl rand -hex 32)/" .env
  sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=http://${PUBLIC_IP}:3000|" .env
  sed -i "s|^NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=http://${PUBLIC_IP}:3001|" .env
  echo "[bootstrap] .env 已建立（正式上線前請改回網域與固定密鑰）。"
fi

echo "[bootstrap] 執行 deploy-vps.sh（build → up → 冒煙）…"
./scripts/deploy-vps.sh

echo
echo "[bootstrap] 完成！驗證網址："
echo "  網站  http://${PUBLIC_IP}:3000"
echo "  API   http://${PUBLIC_IP}:3001/health"
echo "[bootstrap] 正式上線前：Caddy HTTPS + 資料庫綁本機 + 面板不曝公網（docs/deploy-vps.md）"
