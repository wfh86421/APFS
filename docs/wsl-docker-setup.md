# WSL2 + Docker Engine 設定（Windows 10 IoT Enterprise LTSC 2021）

## 為什麼不能用 Docker Desktop

Docker Desktop 最低需求：Windows 10 **22H2（19045）** 或 Windows 11 **23H2（22631）**。
本機是 **Windows 10 IoT Enterprise LTSC 2021（19044）**——LTSC 是固定版本，
**不會**收到 22H2 功能更新，因此 Docker Desktop 在此機器上無法安裝，重跑安裝程式沒有意義。

## 替代方案（推薦）：WSL2 內安裝 Docker Engine

WSL2 支援 Windows 10 2004（19041）以上，本機 19044 完全符合；Docker Engine
跑在 WSL2 的 Linux 發行版內，**不需要 Docker Desktop**，與 Docker Desktop 功能等價。

### 步驟 1：啟用 WSL2 並安裝 Ubuntu（系統管理員 PowerShell）

```powershell
# 方式一（一鍵，Win10 21H2 通常可用）：
wsl --install -d Ubuntu

# 若 wsl --install 無效，改用手動啟用功能：
dism /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
wsl --set-default-version 2
```

**重新開機**，然後確認：

```powershell
wsl -l -v
# Ubuntu 那一行必須顯示 VERSION = 2
```

> 若 `wsl -l -v` 顯示 VERSION = 1：`wsl --set-default-version 2`
> 若完全無法啟動：進 BIOS 開啟虛擬化（Intel VT-x / AMD-V / SVM）。

### 步驟 2：Ubuntu 內安裝 Docker Engine

```bash
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

確認 WSL 使用 systemd（否則 docker 服務不會自動啟動）：

```bash
cat /etc/wsl.conf   # 應有：
# [boot]
# systemd=true
```

若沒有，編輯 `/etc/wsl.conf` 補上後，在 Windows 端 `wsl --shutdown` 再重進。

驗證：

```bash
docker compose version
docker run --rm hello-world
```

### 步驟 3：在 WSL 內跑 ShieldScan 完整堆疊

建議把 repo 複製到 WSL 家目錄（`/mnt/c` 掛載效能較慢）：

```bash
cd ~
git clone git@github.com:wfh86421/APFS.git
cd APFS
cp .env.example .env      # 編輯 POSTGRES_PASSWORD、REPORT_SIGNING_SECRET
docker compose up -d --build
node scripts/smoke-compose.mjs   # 期望 5/5
```

Windows 瀏覽器連 WSL 的服務：WSL2 預設會把 localhost 轉發到 Windows，
直接開 http://localhost:3000 與 http://localhost:3001 即可。

## 備援：完全不裝 Docker（專案原生支援）

所有功能與測試（除了 Docker 鏡像建置本身）都不需要 Docker：

```bash
pnpm dev:db        # 內嵌 PostgreSQL + Redis（含 schema）
pnpm dev:api       # http://localhost:3001
pnpm dev:web       # http://localhost:3000
pnpm check         # 型別 + 建置 + 單元測試
pnpm test:e2e      # Playwright 端到端
pnpm verify:prod-storage   # 正式儲存切換驗證（內嵌 DB）
```

> 若 embedded-postgres 在你的環境 initdb 失敗，可改用 WSL 內的 PostgreSQL，
> 或安裝原生 PostgreSQL 後設 `DATABASE_URL` 指向它（詳見 docs/local-dev.md）。

## 備援：直接用 VPS 當「鏡像測試」環境

如果你的 VPS 已裝 Docker，也可以在 VPS 上先跑完整驗證再上線：

```bash
git clone git@github.com:wfh86421/APFS.git
cd APFS
cp .env.example .env
docker compose up -d --build
node scripts/smoke-compose.mjs
```

這等同把「本地創鏡像 → 測試」搬上 VPS，驗證無誤後同一份 compose 直接上線。
