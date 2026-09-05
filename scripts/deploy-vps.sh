#!/usr/bin/env bash
#
# ShieldScan VPS 部署腳本（idempotent）
#
# 前置：
#   1. VPS 安裝 Docker Engine + compose plugin（docs/deploy-vps.md）
#   2. 複製本專案到 VPS（git clone git@github.com:wfh86421/APFS.git）
#   3. 準備 .env（cp .env.example .env 並填正式值）
#
# 用法：
#   ./scripts/deploy-vps.sh

set -euo pipefail

REPO_DIR="${REPO_DIR:-$(pwd)}"
cd "$REPO_DIR"

echo "[deploy] git pull --ff-only …"
git pull --ff-only

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[deploy] 已建立 .env，請先編輯正式值（REPORT_SIGNING_SECRET / POSTGRES_PASSWORD / NEXT_PUBLIC_API_URL）再重新執行。"
  exit 1
fi

echo "[deploy] docker compose build --pull …"
docker compose build --pull

echo "[deploy] docker compose up -d …"
docker compose up -d

echo "[deploy] 套用/更新 DB schema（init.sql，冪等）…"
docker compose exec -T postgres psql -U shieldscan -d shieldscan < infra/docker/postgres/init.sql

echo "[deploy] 等待 API 就緒 …"
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3001/health >/dev/null 2>&1; then
    echo "[deploy] API OK"
    break
  fi
  sleep 2
done

echo "[deploy] 冒煙測試（smoke-compose）…"
node scripts/smoke-compose.mjs

docker compose ps
echo "[deploy] 完成"
