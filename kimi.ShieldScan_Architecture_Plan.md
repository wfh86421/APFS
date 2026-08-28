# 隱盾檢測 (ShieldScan) — 瀏覽器指紋與網絡環境安全檢測平台
## 完整技術架構規劃書

> **版本**: v1.0 | **日期**: 2026-08-28 | **定位**: 核心平台 + 可插拔檢測模組 + 可插拔評分規則 + 可插拔輸出渠道 + 多平台協同 SDK

---

## 一、專案定位

| 項目 | 內容 |
|------|------|
| **產品名稱** | ShieldScan（隱盾檢測） |
| **核心價值** | 一站式瀏覽器指紋與網絡環境安全檢測平台，提供即時隱私評分、風險預警與環境一致性驗證 |
| **目標用戶** | 資安工程師、隱私研究員、反詐欺團隊、開發者、一般使用者 |
| **架構哲學** | 「一切皆插件」—— 檢測模組可插拔、評分規則可插拔、輸出渠道可插拔、輸出格式可插拔 |
| **設計原則** | 分層解耦、信號多維交叉驗證、ML 驅動異常檢測、開放 SDK 生態 |

---

## 二、系統架構總覽（五層架構）

```
+-----------------------------------------------------------------------------+
|                        展示層 (Presentation Layer)                            |
|   Web Dashboard | 嵌入式 Widget | CLI 工具 | 瀏覽器擴充套件 | Mobile App   |
+-----------------------------------------------------------------------------+
|                        輸出渠道插件層 (Output Channel Plugins)                  |
|   Webhook | Slack | Discord | Email | Telegram | SIEM | 自定義 API           |
+-----------------------------------------------------------------------------+
|                        評分引擎層 (Scoring Engine)                             |
|   規則引擎 (Rule-based) | ML 異常模型 | 一致性驗證器 | 插件化評分規則          |
+-----------------------------------------------------------------------------+
|                        檢測模組層 (Detection Module Plugins)                   |
|   網路層 | 硬體層 | 瀏覽器層 | 行為層 | 軟體層 | 自定義檢測模組             |
+-----------------------------------------------------------------------------+
|                        核心平台層 (Core Platform)                              |
|   插件管理器 | 信號聚合器 | 任務調度器 | 資料管線 | SDK 核心 | 認證授權         |
+-----------------------------------------------------------------------------+
|                        資料層 (Data Layer)                                    |
|   PostgreSQL | Redis | ClickHouse | S3/MinIO | Vector DB (Milvus)           |
+-----------------------------------------------------------------------------+
```

### 信號採集分層模型

| 層級 | 採集位置 | 信號類型 | 偽造難度 | 關鍵技術 |
|------|---------|---------|---------|---------|
| **L0 網路層** | Server-side (反向代理/WAF) | TLS JA4、HTTP/2 SETTINGS、TCP/IP 特徵 | 極難 | JA4 指紋、TCP 指紋 |
| **L1 傳輸層** | Server-side + Client | IP 地理位置、WebRTC、DNS 洩漏、端口掃描 | 很難 | STUN/TURN、端口探測 |
| **L2 硬體層** | Client-side (JS) | Canvas、WebGL、WebGPU、Audio、GPU 資訊 | 中等 | WebGPU Adapter Info、Shader Timing |
| **L3 瀏覽器層** | Client-side (JS) | User-Agent、Platform、語言、時區、字體 | 容易 | Client Hints、Intl API |
| **L4 行為層** | Client-side (JS) | 滑鼠軌跡、鍵盤節奏、頁面停留、滾動模式 | 中等 | 行為生物特徵 |
| **L5 軟體層** | Client-side (JS) | 插件列表、Cookie 狀態、Flash/Java、DNT | 非常容易 | Navigator API |

> **核心洞察**: L0/L1 信號無法從瀏覽器端偽造，是「信任錨點」。L2-L5 信號用於設備識別與一致性驗證。跨層不一致即為高風險信號。

---

## 三、技術棧規劃

### 3.1 前端 (Frontend)

| 類別 | 技術選型 | 理由 |
|------|---------|------|
| **框架** | Next.js 15 (App Router) + React 19 | SSR/SSG 支援、效能優化、生態成熟 |
| **語言** | TypeScript 5.5 | 型別安全、IDE 支援、維護性 |
| **樣式** | Tailwind CSS 4 + shadcn/ui | 原子化 CSS、元件庫豐富、客製化彈性 |
| **狀態管理** | Zustand + TanStack Query | 輕量、非同步狀態管理優秀 |
| **圖表** | Recharts + D3.js | 互動式數據視覺化 |
| **指紋採集 SDK** | 自研 shieldscan-sdk (基於 FingerprintJS 思路 + WebGPU 擴充) | 完全可控、可插拔模組、支援多平台 |
| **WebSocket** | Socket.io Client | 即時檢測進度推送 |
| **PWA** | next-pwa | 離線支援、可安裝為 App |

### 3.2 後端 (Backend)

| 類別 | 技術選型 | 理由 |
|------|---------|------|
| **API 框架** | FastAPI (Python 3.12) | 非同步高效、自動生成 OpenAPI、型別提示 |
| **即時服務** | Node.js + Socket.io (獨立服務) | WebSocket 長連接管理、廣播 |
| **任務隊列** | Celery + Redis | 分散式任務、定時任務、重試機制 |
| **ML 服務** | Python + scikit-learn / XGBoost / PyTorch | 異常檢測模型、指紋相似度計算 |
| **網路指紋解析** | Python ja4 庫 + 自研 TCP 指紋解析 | JA4 標準實現 |
| **地理定位** | MaxMind GeoIP2 + 自研台灣地址庫 | 精準 IP 定位 |
| **文檔生成** | WeasyPrint / Playwright | PDF 報告生成 |

### 3.3 資料層 (Data Layer)

| 類別 | 技術選型 | 用途 |
|------|---------|------|
| **主資料庫** | PostgreSQL 16 | 用戶、檢測記錄、評分歷史、插件配置 |
| **快取** | Redis 7 (Cluster) | Session、即時數據、排行榜、Rate Limit |
| **時序/分析資料庫** | ClickHouse 24 | 大規模指紋數據分析、趨勢查詢 |
| **向量資料庫** | Milvus 2.4 | 指紋特徵向量相似度搜索 (Faiss 替代) |
| **物件儲存** | MinIO (S3-compatible) | 報告 PDF、原始檢測數據、模型檔案 |
| **搜尋引擎** | Meilisearch | 檢測記錄全文檢索 |

### 3.4 基礎設施 (DevOps)

| 類別 | 技術選型 | 理由 |
|------|---------|------|
| **容器化** | Docker + Docker Compose (開發) / Kubernetes (生產) | 標準化部署、彈性擴展 |
| **CI/CD** | GitHub Actions | 自動化測試、建置、部署 |
| **反向代理** | Traefik v3 | 自動服務發現、Let's Encrypt、Middleware |
| **監控** | Prometheus + Grafana + Loki + Alertmanager | 指標、日誌、告警 |
| **APM** | Sentry + OpenTelemetry | 錯誤追蹤、分散式追蹤 |
| **API 閘道** | Kong / Traefik | Rate Limit、認證、路由 |

---

## 四、核心模組實現方案

### 4.1 客戶端指紋採集引擎 (shieldscan-sdk)

```typescript
// 插件化架構設計
interface DetectionModule {
  id: string;
  name: string;
  category: 'network' | 'hardware' | 'browser' | 'behavior' | 'software';
  version: string;
  priority: number; // 執行順序
  
  // 核心方法
  collect(): Promise<SignalPayload>;
  validate?(payload: SignalPayload): ValidationResult;
  getEntropy?(): number; // 該模組的指紋熵值估計
}

// 核心採集器
class ShieldScanSDK {
  private modules: Map<string, DetectionModule> = new Map();
  private config: SDKConfig;
  
  register(module: DetectionModule): void;
  unregister(moduleId: string): void;
  async scan(): Promise<FullFingerprint>;
  async scanStream(): AsyncGenerator<PartialResult>; // 流式採集
}
```

#### 內建模組清單

| 模組 ID | 名稱 | 類別 | 採集內容 | 熵值(估計) |
|---------|------|------|---------|-----------|
| `canvas` | Canvas 指紋 | hardware | 2D 渲染像素哈希、篡改檢測 | ~15 bits |
| `webgl` | WebGL 指紋 | hardware | GPU Vendor/Renderer、參數、擴充 | ~20 bits |
| `webgpu` | WebGPU 指紋 | hardware | Adapter Info、Feature Flags、Limits、Shader Timing | ~30 bits |
| `audio` | Audio 指紋 | hardware | AudioContext 輸出哈希、壓縮器特徵 | ~12 bits |
| `screen` | 螢幕指紋 | hardware | 解析度、色彩深度、DPR、觸控點數 | ~8 bits |
| `hardware` | 硬體資訊 | hardware | deviceMemory、hardwareConcurrency、GPU 型號 | ~10 bits |
| `webrtc` | WebRTC 洩漏 | network | 本地 IP、STUN 伺服器回應 | ~6 bits |
| `fonts` | 字體指紋 | browser | 已安裝字體列表、字體渲染差異 | ~10 bits |
| `timezone` | 時區指紋 | browser | Intl API、時區偏移、語言 | ~5 bits |
| `clienthints` | Client Hints | browser | Sec-CH-UA、平台、行動裝置標記 | ~4 bits |
| `storage` | 儲存指紋 | browser | Cookie、LocalStorage、IndexedDB 可用性 | ~3 bits |
| `behavior` | 行為採集 | behavior | 滑鼠移動、點擊節奏、滾動速度 (需授權) | ~15 bits |
| `ports` | 端口掃描 | network | 常見端口開放狀態 (22, 3389, 445 等) | ~4 bits |
| `tamper` | 篡改檢測 | browser | API 是否被修改、toString 篡改、Proxy 攔截 | ~8 bits |

#### WebGPU 指紋採集範例（2026 核心技術）

```typescript
// modules/webgpu.ts
async function collectWebGPU(): Promise<WebGPUPayload> {
  if (!navigator.gpu) return { supported: false };
  
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const info = await adapter.requestAdapterInfo();
  
  // 核心指紋信號
  const signals = {
    vendor: info.vendor,
    architecture: info.architecture,
    device: info.device,
    description: info.description,
    driver: info.driver,
    // 60+ 個 limits 參數
    limits: Object.fromEntries(
      Object.entries(adapter.limits).map(([k, v]) => [k, v])
    ),
    // Feature flags
    features: Array.from(adapter.features),
    // 首選 Canvas 格式
    preferredCanvasFormat: navigator.gpu.getPreferredCanvasFormat(),
    // Shader 編譯計時 (微基準)
    shaderCompileTime: await benchmarkShaderCompile(device),
    // Compute shader 效能探測
    computeBenchmark: await runComputeBenchmark(device),
  };
  
  return { supported: true, signals, hash: hashSignals(signals) };
}
```

### 4.2 IP / 網絡環境檢測 (Network Detection)

```python
# 網路檢測服務架構
class NetworkDetectionService:
    """Server-side 網路層檢測，無法被客戶端偽造"""
    
    async def analyze(self, request: Request) -> NetworkReport:
        return NetworkReport(
            # L0: TLS 指紋
            tls_ja4=await self.ja4_fingerprint(request),
            tls_ja3=await self.ja3_fingerprint(request),
            
            # L0: HTTP/2 指紋
            http2_fingerprint=self.http2_settings(request),
            
            # L0: TCP/IP 指紋
            tcp_fingerprint=self.tcp_ip_analysis(request),
            
            # L1: IP 情報
            ip_geo=await self.maxmind_lookup(request.client_ip),
            ip_reputation=await self.ip_reputation_check(request.client_ip),
            ip_history=await self.get_ip_history(request.client_ip),
            
            # L1: DNS 洩漏檢測
            dns_leak=await self.dns_leak_test(request),
            
            # L1: WebRTC 一致性驗證
            webrtc_consistency=await self.verify_webrtc_ip(request),
            
            # 代理/VPN 檢測
            proxy_detection=await self.detect_proxy(request),
            vpn_detection=await self.detect_vpn(request),
            tor_exit=await self.check_tor_exit(request.client_ip),
            datacenter=await self.check_datacenter(request.client_ip),
        )
```

#### JA4 指紋實現

```python
# 基於 ja4 庫的 TLS 指紋採集
from ja4 import ja4s, ja4h, ja4x, ja4t

async def compute_ja4_fingerprint(tls_data: bytes) -> dict:
    """
    JA4: TLS Client Hello 指紋
    JA4S: TLS Server Hello 指紋
    JA4H: HTTP 請求指紋
    JA4T: TCP 指紋
    JA4X: X.509 證書指紋
    """
    return {
        'ja4': ja4s.hash(tls_data),
        'ja4_fingerprint': ja4s.fingerprint(tls_data),
        'tls_version': ja4s.get_version(tls_data),
        'cipher_suites': ja4s.get_ciphers(tls_data),
        'extensions': ja4s.get_extensions(tls_data),
        'sni': ja4s.get_sni(tls_data),
        'alpn': ja4s.get_alpn(tls_data),
    }
```

### 4.3 隱私評分引擎 (Privacy Scoring Engine)

```python
# 評分引擎插件化架構
class ScoringEngine:
    def __init__(self):
        self.rules: list[ScoringRule] = []
        self.ml_model: Optional[AnomalyDetector] = None
    
    def register_rule(self, rule: ScoringRule) -> None:
        self.rules.append(rule)
    
    async def calculate_score(self, fingerprint: FullFingerprint) -> PrivacyScore:
        # 1. 規則引擎評分 (Rule-based)
        rule_score = self.apply_rules(fingerprint)
        
        # 2. 一致性驗證 (Consistency Check)
        consistency = self.check_cross_layer_consistency(fingerprint)
        
        # 3. ML 異常檢測
        anomaly_score = await self.ml_predict(fingerprint)
        
        # 4. 加權聚合
        final_score = self.aggregate_scores(rule_score, consistency, anomaly_score)
        
        return PrivacyScore(
            total_score=final_score,
            max_score=100,
            grade=self.score_to_grade(final_score),
            deductions=self.get_deductions(fingerprint),
            risk_flags=self.get_risk_flags(fingerprint),
            consistency_report=consistency,
        )
    
    def check_cross_layer_consistency(self, fp: FullFingerprint) -> ConsistencyReport:
        """跨層一致性驗證 — 檢測偽造與欺騙"""
        checks = []
        
        # 檢查 1: UA 宣稱的 OS 與 Platform API 是否一致
        ua_os = parse_ua_os(fp.browser.user_agent)
        platform_os = fp.browser.platform
        checks.append(ConsistencyCheck(
            name='OS 一致性',
            passed=ua_os == platform_os,
            severity='high' if ua_os != platform_os else 'none',
            evidence=f'UA: {ua_os} vs Platform: {platform_os}'
        ))
        
        # 檢查 2: GPU 型號與宣稱設備是否匹配
        gpu = fp.hardware.webgpu or fp.hardware.webgl
        device_claim = fp.browser.device_model
        checks.append(ConsistencyCheck(
            name='GPU-設備一致性',
            passed=self.gpu_matches_device(gpu, device_claim),
            severity='medium',
            evidence=f'GPU: {gpu.renderer} vs Device: {device_claim}'
        ))
        
        # 檢查 3: IP 地理位置與時區是否匹配
        ip_tz = fp.network.ip_geo.timezone
        js_tz = fp.browser.timezone
        checks.append(ConsistencyCheck(
            name='IP-時區一致性',
            passed=ip_tz == js_tz,
            severity='low',
            evidence=f'IP TZ: {ip_tz} vs JS TZ: {js_tz}'
        ))
        
        # 檢查 4: WebGPU 與 WebGL GPU 資訊是否一致
        if fp.hardware.webgpu and fp.hardware.webgl:
            checks.append(ConsistencyCheck(
                name='WebGPU-WebGL 一致性',
                passed=self.gpu_info_consistent(
                    fp.hardware.webgpu, 
                    fp.hardware.webgl
                ),
                severity='high',
                evidence='GPU 資訊跨 API 不一致，疑似偽造'
            ))
        
        # 檢查 5: 端口開放異常 (手機不應開放 SSH/RDP)
        if fp.network.open_ports:
            unusual_ports = [p for p in fp.network.open_ports if p in [22, 3389, 445]]
            checks.append(ConsistencyCheck(
                name='端口開放異常',
                passed=len(unusual_ports) == 0,
                severity='high',
                evidence=f'檢測到異常開放端口: {unusual_ports}'
            ))
        
        return ConsistencyReport(checks=checks)
```

#### 評分規則範例（基於用戶報告數據）

```python
# rules/default_scoring_rules.py

RULES = [
    ScoringRule(
        id='canvas_tamper',
        name='Canvas 指紋篡改',
        category='privacy_protection',
        condition=lambda fp: fp.hardware.canvas.is_tampered == True,
        deduction=5,
        description='瀏覽器對 Canvas API 進行了修改，可能是 Brave 等隱私瀏覽器的保護機制',
        severity='info',
    ),
    ScoringRule(
        id='os_mismatch',
        name='作業系統不一致',
        category='spoofing',
        condition=lambda fp: fp.browser.ua_os != fp.browser.platform_os,
        deduction=5,
        description='User-Agent 宣稱的 OS 與實際檢測到的 Platform 不匹配',
        severity='warning',
    ),
    ScoringRule(
        id='dns_leak',
        name='DNS 洩漏',
        category='network_security',
        condition=lambda fp: fp.network.dns_leak.detected == True,
        deduction=10,
        description='檢測到 DNS 洩漏，真實 ISP 的 DNS 伺服器被暴露',
        severity='warning',
    ),
    ScoringRule(
        id='open_ports_ssh_rdp',
        name='異常端口開放',
        category='network_security',
        condition=lambda fp: any(p in [22, 3389] for p in fp.network.open_ports),
        deduction=15,
        description='檢測到 SSH(22) 或 RDP(3389) 端口開放，手機網路極不尋常',
        severity='critical',
    ),
    ScoringRule(
        id='webrtc_leak',
        name='WebRTC IP 洩漏',
        category='network_security',
        condition=lambda fp: fp.network.webrtc.local_ips and len(fp.network.webrtc.local_ips) > 0,
        deduction=8,
        description='WebRTC 洩漏了本地 IP 地址',
        severity='warning',
    ),
    ScoringRule(
        id='bot_detected',
        name='機器人特徵檢測',
        category='automation',
        condition=lambda fp: fp.software.bot_detection == True,
        deduction=20,
        description='檢測到自動化工具或機器人特徵',
        severity='critical',
    ),
    ScoringRule(
        id='incognito_mode',
        name='無痕模式檢測',
        category='privacy',
        condition=lambda fp: fp.browser.incognito == True,
        deduction=0,  # 不扣分，但標記
        description='用戶處於無痕/隱私瀏覽模式',
        severity='info',
    ),
    ScoringRule(
        id='datacenter_ip',
        name='數據中心 IP',
        category='network_security',
        condition=lambda fp: fp.network.ip_reputation.is_datacenter == True,
        deduction=5,
        description='IP 來自數據中心，可能是 VPS/伺服器/代理',
        severity='info',
    ),
]
```

### 4.4 資料庫 Schema（核心表）

```sql
-- 核心檢測記錄表
CREATE TABLE fingerprint_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id VARCHAR(64) NOT NULL,
    session_id VARCHAR(64) NOT NULL,
    scan_version VARCHAR(16) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    client_ip INET NOT NULL,
    ja4_fingerprint VARCHAR(255),
    ja3_fingerprint VARCHAR(255),
    http2_fingerprint VARCHAR(255),
    tcp_fingerprint VARCHAR(255),
    privacy_score SMALLINT CHECK (privacy_score BETWEEN 0 AND 100),
    grade CHAR(1) CHECK (grade IN ('A','B','C','D','F')),
    risk_level VARCHAR(16) CHECK (risk_level IN ('low','medium','high','critical')),
    signals JSONB NOT NULL,
    deductions JSONB DEFAULT '[]',
    consistency_report JSONB,
    CONSTRAINT unique_visitor_session UNIQUE (visitor_id, session_id)
);

-- 訪客設備檔案表
CREATE TABLE visitor_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id VARCHAR(64) UNIQUE NOT NULL,
    hardware_hash VARCHAR(64),
    webgpu_hash VARCHAR(64),
    webgl_hash VARCHAR(64),
    canvas_hash VARCHAR(64),
    audio_hash VARCHAR(64),
    device_type VARCHAR(32),
    os_family VARCHAR(32),
    os_version VARCHAR(32),
    browser_family VARCHAR(32),
    browser_version VARCHAR(32),
    gpu_vendor VARCHAR(64),
    gpu_renderer VARCHAR(128),
    screen_resolution VARCHAR(16),
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    scan_count INTEGER DEFAULT 1,
    fingerprint_vector VECTOR(256)
);

-- 插件註冊表
CREATE TABLE plugins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_id VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    category VARCHAR(32) NOT NULL,
    version VARCHAR(16) NOT NULL,
    description TEXT,
    config_schema JSONB,
    default_config JSONB,
    is_enabled BOOLEAN DEFAULT true,
    is_builtin BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 評分規則表
CREATE TABLE scoring_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    category VARCHAR(32) NOT NULL,
    condition_logic JSONB NOT NULL,
    deduction SMALLINT NOT NULL DEFAULT 0,
    severity VARCHAR(16) CHECK (severity IN ('info','warning','critical')),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 100,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 輸出渠道配置
CREATE TABLE output_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    channel_type VARCHAR(32) NOT NULL,
    config JSONB NOT NULL,
    filters JSONB,
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- IP 信譽庫
CREATE TABLE ip_reputation (
    ip_range CIDR PRIMARY KEY,
    reputation_score SMALLINT CHECK (reputation_score BETWEEN 0 AND 100),
    categories VARCHAR(32)[],
    first_seen TIMESTAMPTZ,
    last_seen TIMESTAMPTZ,
    source VARCHAR(64)
);

-- 索引優化
CREATE INDEX idx_scans_visitor_id ON fingerprint_scans(visitor_id);
CREATE INDEX idx_scans_created_at ON fingerprint_scans(created_at);
CREATE INDEX idx_scans_ip ON fingerprint_scans(client_ip);
CREATE INDEX idx_scans_score ON fingerprint_scans(privacy_score);
CREATE INDEX idx_visitor_hardware ON visitor_profiles(hardware_hash);
CREATE INDEX idx_plugins_category ON plugins(category);
CREATE INDEX idx_scans_signals ON fingerprint_scans USING GIN(signals);
```

---

## 五、API 設計

### 5.1 核心端點

| 方法 | 端點 | 說明 |
|------|------|------|
| POST | /api/v1/scans | 發起新的指紋檢測 |
| GET | /api/v1/scans/{scan_id} | 獲取檢測結果 |
| GET | /api/v1/scans/{scan_id}/stream | SSE 流式獲取檢測進度 |
| GET | /api/v1/visitors/{visitor_id} | 獲取訪客設備檔案 |
| POST | /api/v1/visitors/{visitor_id}/similarity | 計算與其他指紋的相似度 |
| GET | /api/v1/plugins | 列出所有可用插件 |
| POST | /api/v1/plugins | 註冊新插件 |
| GET | /api/v1/plugins/{plugin_id} | 獲取插件詳情 |
| PATCH | /api/v1/plugins/{plugin_id} | 更新插件配置 |
| DELETE | /api/v1/plugins/{plugin_id} | 卸載插件 |
| GET | /api/v1/scoring/rules | 列出評分規則 |
| POST | /api/v1/scoring/rules | 創建新規則 |
| POST | /api/v1/scoring/calculate | 對任意指紋數據執行評分 |
| GET | /api/v1/reports/{scan_id}/pdf | 下載 PDF 檢測報告 |
| POST | /api/v1/webhooks | 註冊 Webhook 回調 |

### 5.2 WebSocket 事件

```javascript
// 檢測進度實時推送
{
  event: 'scan.progress',
  data: {
    scan_id: 'uuid',
    phase: 'hardware',
    module: 'webgpu',
    progress: 45,
    status: 'collecting',
    partial_result: { ... }
  }
}

// 檢測完成
{
  event: 'scan.completed',
  data: {
    scan_id: 'uuid',
    report_url: '/api/v1/scans/uuid',
    privacy_score: 85,
    grade: 'B',
    summary: '檢測到 3 個問題，建議關注 DNS 洩漏風險'
  }
}

// 風險告警（即時）
{
  event: 'alert.risk_detected',
  data: {
    severity: 'critical',
    type: 'bot_detected',
    message: '檢測到高度疑似自動化工具訪問',
    fingerprint_id: 'uuid',
    visitor_id: 'visitor_hash'
  }
}
```

---

## 六、前端頁面結構

```
/                          # 首頁 — 快速掃描入口
+-- /scan                  # 檢測頁面 (核心)
|   +-- /new               # 新檢測
|   +-- /{id}              # 檢測結果詳情
|   +-- /compare           # 多指紋對比
+-- /dashboard             # 個人儀表板
|   +-- /history           # 檢測歷史
|   +-- /trends            # 隱私趨勢分析
|   +-- /devices           # 我的設備管理
+-- /reports               # 報告中心
|   +-- /public/{token}    # 公開分享報告
|   +-- /export            # 批量導出
+-- /plugins               # 插件市場
|   +-- /marketplace       # 瀏覽插件
|   +-- /installed         # 已安裝插件
|   +-- /developer         # 插件開發文檔
+-- /rules                 # 評分規則管理
|   +-- /editor            # 規則編輯器 (可視化)
|   +-- /templates         # 規則模板
+-- /api-keys              # API 金鑰管理
+-- /settings              # 帳戶設定
+-- /docs                  # 開發者文檔
    +-- /sdk               # SDK 整合指南
    +-- /api               # API 參考
    +-- /architecture      # 架構說明
```

### 檢測結果頁面組件結構

```
ScanResultPage
+-- OverviewCard           # 頂部概覽 (IP、位置、瀏覽器、評分)
+-- ScoreGauge             # 隱私評分儀表盤 (動畫)
+-- IssueList              # 扣分項列表 (可展開詳情)
+-- NetworkSection         # IP / 網絡環境
|   +-- IPDetails          # IP 地址、ISP、代理檢測
|   +-- WebRTCLeak         # WebRTC 洩漏檢測
|   +-- DNSLeak            # DNS 洩漏檢測
|   +-- PortScan           # 端口掃描結果
+-- HardwareSection        # 硬體指紋
|   +-- CanvasFingerprint  # Canvas 指紋可視化
|   +-- WebGLFingerprint   # WebGL 資訊
|   +-- WebGPUFingerprint  # WebGPU 詳細報告 (2026 核心)
|   +-- AudioFingerprint   # 音訊指紋
|   +-- DeviceSpecs        # 設備規格
+-- BrowserSection         # 瀏覽器詳情
|   +-- UserAgent          # UA 解析
|   +-- ConsistencyCheck   # 跨層一致性檢查結果
|   +-- FeatureDetection   # 功能支援檢測
+-- SoftwareSection        # 軟體與環境
|   +-- TimezoneCheck      # 時區驗證
|   +-- LanguageCheck      # 語言設定
|   +-- StorageCheck       # 儲存機制檢測
+-- ConsistencyMatrix      # 一致性矩陣熱力圖
+-- RiskRadar              # 風險雷達圖
+-- ActionButtons          # 分享/下載/重新檢測
```

---

## 七、安全與隱私考量

### 7.1 數據保護

| 措施 | 實現方式 |
|------|---------|
| **數據最小化** | 僅採集必要的指紋信號，提供「輕量模式」僅採集基礎信號 |
| **數據加密** | 靜態數據 AES-256 加密、傳輸 TLS 1.3、敏感字段額外加密 |
| **數據保留** | 預設 90 天自動清理、用戶可手動刪除歷史記錄 |
| **匿名化** | 原始指紋數據與用戶帳戶分離存儲，使用哈希關聯 |
| **GDPR/CCPA 合規** | 明確同意機制、數據可攜性 (JSON 導出)、被遺忘權 |

### 7.2 防護機制

| 威脅 | 防護措施 |
|------|---------|
| **信號重放攻擊** | 每個採集請求包含 nonce 與時間戳，Server-side 驗證時效性 |
| **SDK 篡改** | 核心採集邏輯混淆 + 完整性校驗 (Subresource Integrity) |
| **API 濫用** | Rate Limiting (IP 級 + 帳戶級)、CAPTCHA 挑戰 |
| **指紋數據洩露** | 數據庫字段級加密、最小權限原則 |
| **CSRF/XSS** | SameSite Cookie、CSP 策略、輸入驗證 |

### 7.3 隱私設計原則

```
Privacy by Design
+-- 透明性: 用戶可查看採集了哪些信號、為何需要
+-- 可控性: 用戶可選擇性關閉特定檢測模組
+-- 可刪除性: 一鍵清除所有個人檢測數據
+-- 不可追蹤性: 平台本身不使用指紋進行追蹤或廣告
+-- 開源性: SDK 核心採集邏輯開源 (MIT)，接受審計
```

---

## 八、開發階段規劃

### Phase 1: MVP (4-6 週)

| 週次 | 任務 | 產出 |
|------|------|------|
| W1 | 專案初始化、核心架構搭建、資料庫設計 | 基礎框架、CI/CD 管線 |
| W2 | 指紋採集 SDK (基礎模組: Canvas, WebGL, WebGPU, Audio, Screen) | shieldscan-sdk v0.1 |
| W3 | 後端 API (採集接收、基礎評分、結果查詢) | REST API v1 |
| W4 | 前端檢測頁面 + 結果展示 | 可運作的檢測流程 |
| W5 | 網路層檢測 (JA4, IP Geo, WebRTC, DNS Leak) | 完整網路檢測 |
| W6 | 整合測試、性能優化、部署上線 | MVP 上線 |

### Phase 2: 插件化與擴展 (4-6 週)

| 任務 | 說明 |
|------|------|
| 插件管理系統 | 動態載入/卸載檢測模組、插件市場 |
| 評分規則引擎 | 可視化規則編輯器、JSON Logic 支援 |
| 輸出渠道系統 | Webhook、Slack、Email、SIEM 整合 |
| 一致性驗證引擎 | 跨層一致性自動檢測 |
| 公開 API | API Key 管理、文檔生成 |

### Phase 3: ML 與進階分析 (4-6 週)

| 任務 | 說明 |
|------|------|
| 異常檢測模型 | 基於歷史數據訓練的 ML 模型 (XGBoost / Isolation Forest) |
| 指紋相似度搜索 | 向量數據庫 (Milvus) + 近似最近鄰搜索 |
| 行為生物特徵 | 滑鼠/鍵盤行為採集與分析 |
| 趨勢分析儀表板 | 個人隱私趨勢、群體統計 |
| 報告系統 | PDF 生成、定時報告、公開分享 |

### Phase 4: 生態與企業版 (持續)

| 任務 | 說明 |
|------|------|
| 多平台 SDK | React Native、Flutter、Electron、Chrome Extension |
| 企業版功能 | SSO、團隊管理、SLA、專屬部署 |
| SIEM 整合 | Splunk、Datadog、Elastic 原生整合 |
| 威脅情報 | 即時威脅數據庫、黑名單同步 |
| 開源社區 | 插件開發者計畫、貢獻指南 |

---

## 九、文件結構總覽

```
shieldscan/
+-- apps/
|   +-- web/                    # Next.js 前端應用
|   |   +-- app/                # App Router
|   |   +-- components/         # React 元件
|   |   +-- lib/                # 工具函數
|   |   +-- public/             # 靜態資源
|   +-- api/                    # FastAPI 後端服務
|       +-- core/               # 核心平台
|       |   +-- plugin_manager.py
|       |   +-- signal_aggregator.py
|       |   +-- task_scheduler.py
|       |   +-- auth/           # 認證授權
|       +-- modules/            # 檢測模組 (可插拔)
|       |   +-- network/        # 網路層檢測
|       |   |   +-- ja4.py
|       |   |   +-- webrtc.py
|       |   |   +-- dns_leak.py
|       |   |   +-- port_scan.py
|       |   +-- hardware/       # 硬體層檢測
|       |   |   +-- canvas.py
|       |   |   +-- webgl.py
|       |   |   +-- webgpu.py   # WebGPU 指紋 (2026 核心)
|       |   |   +-- audio.py
|       |   +-- browser/        # 瀏覽器層檢測
|       |   +-- behavior/       # 行為層檢測
|       +-- scoring/            # 評分引擎
|       |   +-- engine.py
|       |   +-- rules/          # 規則集
|       |   +-- consistency.py
|       |   +-- ml/             # ML 模型
|       +-- output/             # 輸出渠道 (可插拔)
|       |   +-- webhook.py
|       |   +-- slack.py
|       |   +-- siem.py
|       +-- api/                # REST API 端點
|       +-- websocket/          # Socket.io 服務
|       +-- models/             # SQLAlchemy 模型
|       +-- schemas/            # Pydantic 模型
|       +-- tests/              # 測試
|
+-- packages/
|   +-- shieldscan-sdk/         # 客戶端採集 SDK (TypeScript)
|       +-- src/
|       |   +-- core/           # SDK 核心
|       |   +-- modules/        # 採集模組
|       |   +-- types/          # TypeScript 型別
|       |   +-- utils/          # 工具函數
|       +-- dist/               # 編譯輸出
|       +-- package.json
|
+-- infra/                      # 基礎設施配置
|   +-- docker/                 # Docker Compose 配置
|   +-- k8s/                    # Kubernetes 配置
|   +-- terraform/              # IaC (可選)
|   +-- monitoring/             # Prometheus/Grafana 配置
|
+-- docs/                       # 文檔
|   +-- architecture.md
|   +-- api.md
|   +-- sdk-integration.md
|   +-- plugin-development.md
|   +-- scoring-rules.md
|
+-- scripts/                    # 開發腳本
+-- .github/                    # GitHub Actions
+-- docker-compose.yml
+-- Makefile
+-- README.md
+-- LICENSE
```

---

## 十、核心不可替代要素

以下為本系統的核心競爭力與技術護城河，無法被簡單複製：

### 1. 跨層一致性驗證引擎

**價值**: 將 L0(網路層) 與 L2-L5(客戶端層) 信號進行交叉驗證，檢測偽造、欺騙、反檢測瀏覽器。
**不可替代性**: 需要同時掌握 Server-side 網路指紋 (JA4) 與 Client-side 硬體指紋 (WebGPU) 的專業知識，並建立龐大的不一致性模式庫。

### 2. WebGPU 深度指紋採集

**價值**: 2026 年最先進的硬體指紋向量，entropy 高達 30+ bits，包含 Shader 編譯計時、Compute Benchmark、Feature Flags 等無法被淺層 JavaScript 補丁偽造的信號。
**不可替代性**: 需要深入理解 WebGPU API 與底層 GPU 驅動行為，並建立各 GPU 型號的基準數據庫。

### 3. 插件化架構設計

**價值**: 檢測模組、評分規則、輸出渠道全部插件化，用戶/開發者可自定義整個檢測流程。
**不可替代性**: 高度解耦的架構設計需要從第一天就規劃，後期重構成本極高。類比 DeepSeek Harness 的「一切皆插件」哲學。

### 4. ML 驅動的異常檢測

**價值**: 基於大規模指紋數據訓練的異常檢測模型，能識別人類難以察覺的模式 (如微妙的信號不一致性)。
**不可替代性**: 需要持續積累的標註數據與特徵工程經驗，數據護城河隨時間增長。

### 5. 台灣/亞太地區優化

**價值**: 針對台灣 ISP (台灣固網、中華電信等)、亞太地區網路基礎設施的精準檢測與定位。
**不可替代性**: 本地化的 IP 定位數據庫、ISP 特徵庫、DNS 伺服器指紋庫需要長期積累。

---

## 十一、技術亮點建議

| 亮點 | 說明 | 展示方式 |
|------|------|---------|
| 實時檢測動畫 | 檢測過程中每個模組的採集進度以動畫呈現 | 前端動畫 + WebSocket |
| 一致性熱力圖 | 跨層信號一致性以熱力圖視覺化 | D3.js 矩陣熱力圖 |
| 隱私評分儀表盤 | 動態圓環圖顯示評分與各維度風險 | Recharts Gauge |
| 指紋 DNA 圖 | 將多維指紋信號以雷達圖/平行座標呈現 | D3.js Radar Chart |
| 一鍵對比 | 並排比較兩個指紋報告，差異高亮 | 雙欄對比視圖 |
| ML 風險預測 | 基於歷史數據預測該設備的風險趨勢 | 趨勢線圖 + 置信區間 |
| PWA 離線檢測 | 支援離線環境進行基礎指紋採集 | Service Worker + IndexedDB |
| 公開分享報告 | 生成可分享的公開連結 (限時/密碼保護) | 短網址 + Token 認證 |
| 可視化規則編輯器 | 拖拽式創建評分規則，無需寫程式 | React Flow + JSON Logic |
| 即時告警 | 檢測到高風險時即時推送到 Slack/Email | Webhook + 隊列系統 |

---

## 十二、參考數據對照（基於用戶檢測報告）

以下為系統針對該報告數據的檢測與評分邏輯對照：

| 檢測項目 | 報告值 | 系統檢測邏輯 | 扣分 |
|---------|--------|------------|------|
| IP 地址 | 49.214.1.196 | MaxMind GeoIP2 查詢 + 台灣固網 ASN 驗證 | 0 |
| 地理位置 | 新北市板橋區 | IP 定位 + 時區交叉驗證 | 0 |
| 瀏覽器 | Brave 142.0.0.0 | UA 解析 + 特徵檢測 (Brave shields) | 0 |
| 平台 | Android 14.0.0 | navigator.platform + navigator.userAgentData | 0 |
| Canvas 篡改 | 檢測到修改 | CanvasRenderingContext2D toString 檢查 | -5 |
| OS 不一致 | UA: Android 10 vs Platform: Android 14 | 跨層一致性驗證 | -5 |
| DNS 洩漏 | 175.96.61.48 (台灣固網 DNS) | 多 DNS 伺服器查詢對比 | -10 |
| WebRTC | 無洩漏 (與公網 IP 一致) | STUN 伺服器測試 | 0 |
| WebGPU | Adreno 613 (Qualcomm) | navigator.gpu.requestAdapterInfo() | 0 |
| 端口開放 | 22 (SSH), 3389 (RDP) | WebSocket 端口探測 | -15 |
| Bot 檢測 | 未檢測到 | 行為分析 + 自動化特徵庫 | 0 |
| 最終評分 | 90 -> 65 | 加權聚合 | **65/100 (Grade C)** |

---

## 附錄：關鍵技術參考

- JA4: FoxIO JA4 — TLS/HTTP/SSH 指紋標準
- FingerprintJS: fingerprintjs/fingerprintjs — 開源瀏覽器指紋庫
- WebGPU Spec: W3C WebGPU — WebGPU 標準規範
- CreepJS: abrahamjuliot/creepjs — 反欺騙檢測研究工具
- Milvus: milvus-io/milvus — 開源向量資料庫
- AmIUnique: amiunique.org — 指紋熵值研究

---

> 本文件為 ShieldScan（隱盾檢測）平台的核心技術架構規劃書，涵蓋從 MVP 到企業級的完整演進路徑。所有技術選型基於 2026 年最新趨勢，特別強調 WebGPU 指紋、JA4 網路指紋、跨層一致性驗證與插件化架構設計。