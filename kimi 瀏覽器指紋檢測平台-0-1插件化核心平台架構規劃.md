# 瀏覽器指紋檢測平台 — 0-1 插件化核心平台架構規劃

> **版本**: v0.1.0-alpha  
> **日期**: 2026-08-28  
> **設計原則**: 像 DeepSeek Harness，一切皆插件。核心平台僅負責生命週期管理與事件總線，所有業務邏輯均以 Plugin 形式掛載。

---

## 目錄

1. [設計哲學](#1-設計哲學)
2. [系統全景圖](#2-系統全景圖)
3. [核心平台（Kernel）](#3-核心平台kernel)
4. [插件體系總覽](#4-插件體系總覽)
5. [可插拔檢測模組（Detection Plugins）](#5-可插拔檢測模組detection-plugins)
6. [可插拔評分規則（Scoring Rule Plugins）](#6-可插拔評分規則scoring-rule-plugins)
7. [可插拔輸出渠道（Output Channel Plugins）](#7-可插拔輸出渠道output-channel-plugins)
8. [多平台協同 SDK（Cross-Platform SDK）](#8-多平台協同-sdkcross-platform-sdk)
9. [資料流與事件總線](#9-資料流與事件總線)
10. [部署架構](#10-部署架構)
11. [開發規範與 Plugin API](#11-開發規範與-plugin-api)
12. [Roadmap（0-1 里程碑）](#12-roadmap0-1-里程碑)

---

## 1. 設計哲學

### 1.1 核心信條

```
Kernel = 事件總線 + 插件加載器 + 配置中心 + 生命週期管理器
Everything Else = Plugin
```

- **核心平台永不包含業務邏輯**。它不認識 Canvas、不認識 WebGL、不認識評分算法。
- **插件是自治單元**。每個 Plugin 自帶 Schema、配置、依賴聲明、啟動/銷毀鉤子。
- **組合勝過繼承**。透過事件總線組合多個 Plugin 完成複雜流程，而非在核心寫死流程。
- **向後兼容優先**。Plugin API 版本化，v1 Plugin 可在 v2 Kernel 上運行。

### 1.2 與傳統架構的對比

| 維度 | 傳統單體架構 | 插件化核心平台 |
|------|-------------|---------------|
| 新檢測項上線 | 改動核心代碼、重新部署 | 上傳 Plugin 包、熱加載 |
| 評分算法 A/B | 改 if-else、發版 | 並行掛載兩套 Rule Plugin、動態切換 |
| 輸出到企業釘釘 | 核心引入 SDK、耦合 | 安裝 DingTalk Output Plugin |
| 多平台支持 | 每平台重寫一套 | 統一 SDK，平台適配層為 Plugin |
| 第三方擴展 | 無法擴展 | 開放 Plugin Marketplace |

---

## 2. 系統全景圖

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          用戶層 (User Layer)                                │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────────┐   │
│  │   Web 頁面  │  │  Chrome  │  │  Node.js │  │  Mobile App (iOS/  │   │
│  │  (檢測報告) │  │  Extension│  │   CLI    │  │   Android/Flutter) │   │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────────┬──────────┘   │
│        │               │               │                   │              │
│        └───────────────┴───────────────┴───────────────────┘              │
│                                    │                                       │
│                    ┌───────────────▼───────────────┐                       │
│                    │     Cross-Platform SDK        │                       │
│                    │   (統一採集 + 統一協議)        │                       │
│                    └───────────────┬───────────────┘                       │
└──────────────────────────────────┼────────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼────────────────────────────────────────┐
│                        核心平台 (Kernel Core)                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────┐  │   │
│  │  │ Event Bus   │  │  Plugin     │  │  Config     │  │  Lifecycle│  │   │
│  │  │ (事件總線)  │  │  Loader     │  │  Center     │  │  Manager  │  │   │
│  │  │             │  │  (插件加載器)│  │  (配置中心)  │  │ (生命週期)│  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └──────────┘  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │   │
│  │  │  Scheduler  │  │  Registry   │  │  Sandbox    │                │   │
│  │  │ (任務調度)  │  │  (服務註冊)  │  │  (安全沙箱)  │                │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Detection Layer │  │  Scoring Layer   │  │  Output Layer    │
│  (檢測插件層)     │  │  (評分規則層)     │  │  (輸出渠道層)     │
│                  │  │                  │  │                  │
│ • canvas-plugin  │  │ • base-score     │  │ • console-plugin │
│ • webgl-plugin   │  │ • os-mismatch    │  │ • webhook-plugin │
│ • audio-plugin   │  │ • dns-leak-rule  │  │ • slack-plugin   │
│ • fonts-plugin   │  │ • webrtc-leak    │  │ • dingtalk-plugin│
│ • webrtc-plugin  │  │ • port-scan-rule │  │ • email-plugin   │
│ • dns-plugin     │  │ • bot-detect-rule│  │ • pdf-export     │
│ • portscan-plugin│  │ • custom-weight  │  │ • json-export    │
│ • bot-plugin     │  │                  │  │ • siem-plugin    │
│ • ... (N 個)     │  │                  │  │ • ... (N 個)     │
└──────────────────┘  └──────────────────┘  └──────────────────┘
                                   │
                                   ▼
                    ┌────────────────────────────┐
                    │      資料持久層 (Storage)     │
                    │  PostgreSQL + Redis + S3/MinIO│
                    │  ClickHouse (時序分析)        │
                    └────────────────────────────┘
```

---

## 3. 核心平台（Kernel）

### 3.1 職責邊界

Kernel **只**做以下六件事：

| 模組 | 職責 | 不做的事 |
|------|------|---------|
| **Event Bus** | 發布/訂閱、事件路由、優先級隊列 | 不解析事件內容的業務含義 |
| **Plugin Loader** | 動態加載、依賴解析、熱更新、簽名校驗 | 不執行 Plugin 的業務邏輯 |
| **Config Center** | 統一配置、環境變量、Plugin 專屬配置 | 不決定配置的業務語義 |
| **Lifecycle Manager** | 啟動順序、健康檢查、優雅關閉、熔斷 | 不處理業務錯誤 |
| **Scheduler** | 定時任務、延遲隊列、任務分片 | 不實現具體任務內容 |
| **Sandbox** | 資源隔離、權限控制、超時熔斷 | 不審查業務合法性 |

### 3.2 Kernel 架構詳細

```typescript
// Kernel 核心介面設計 (TypeScript 偽代碼)

interface Kernel {
  // 事件總線
  eventBus: EventBus;

  // 插件系統
  pluginManager: PluginManager;

  // 配置中心
  config: ConfigCenter;

  // 生命週期
  lifecycle: LifecycleManager;

  // 任務調度
  scheduler: Scheduler;

  // 沙箱
  sandbox: Sandbox;

  // 核心啟動流程
  bootstrap(): Promise<void>;
  shutdown(): Promise<void>;
}

// 事件總線 — 整個系統的「神經系統」
interface EventBus {
  emit(event: KernelEvent): void;
  on(pattern: string, handler: EventHandler, options?: HandlerOptions): Subscription;
  once(pattern: string, handler: EventHandler): Subscription;
  off(subscription: Subscription): void;

  // 支持通配符與優先級
  // e.g., "detection.**", "scoring.completed"
}

// 插件管理器
interface PluginManager {
  load(plugin: PluginManifest): Promise<LoadedPlugin>;
  unload(pluginId: string): Promise<void>;
  reload(pluginId: string): Promise<void>;
  list(): LoadedPlugin[];
  get<T extends Plugin>(id: string): T | undefined;

  // 依賴解析 (拓撲排序)
  resolveDependencies(plugins: PluginManifest[]): PluginManifest[];
}

// 配置中心 — 支持多層級覆蓋
interface ConfigCenter {
  get<T>(key: string, defaultValue?: T): T;
  set(key: string, value: any): void;
  watch(key: string, callback: ConfigChangeHandler): void;

  // 層級: default < file < env < runtime < plugin-specific
}
```

### 3.3 事件總線設計

所有跨模組通訊**必須**通過 Event Bus，禁止直接引用。

```
事件命名規範: <domain>.<action>.<phase>

檢測階段:
  detection.started
  detection.<plugin-id>.started
  detection.<plugin-id>.progress  { percent, detail }
  detection.<plugin-id>.completed { result }
  detection.<plugin-id>.failed    { error, recoverable }
  detection.all.completed         { results: Map<pluginId, Result> }

評分階段:
  scoring.started
  scoring.<rule-id>.applied     { input, output, deduction }
  scoring.completed             { score, issues, grade }

輸出階段:
  output.started
  output.<channel-id>.sending
  output.<channel-id>.completed
  output.all.completed

系統級:
  kernel.bootstrap.started
  kernel.bootstrap.completed
  kernel.plugin.loaded
  kernel.plugin.unloaded
  kernel.error.critical
```

---

## 4. 插件體系總覽

### 4.1 Plugin 通用結構

每個 Plugin 是一個**自包含的自治單元**：

```
plugin-<name>/
├── manifest.json          # 插件元數據與聲明
├── package.json           # 依賴 (Node.js 環境)
├── config.schema.json     # 配置 JSON Schema (用於 UI 表單生成)
├── src/
│   ├── index.ts           # 入口 (導出 activate/deactivate)
│   ├── core/              # 核心邏輯
│   ├── hooks/             # 生命週期鉤子
│   └── types/             # 類型定義
├── assets/                # 靜態資源
├── tests/                 # 單元測試
└── README.md
```

### 4.2 Plugin Manifest 規範

```json
{
  "$schema": "https://fingerscan.io/schemas/plugin-manifest-v1.json",
  "id": "detection-canvas",
  "name": "Canvas Fingerprint Detection",
  "version": "1.2.0",
  "author": "FingerScan Team",
  "license": "MIT",

  "type": "detection",
  "apiVersion": "^1.0.0",

  "entry": "./dist/index.js",
  "configSchema": "./config.schema.json",

  "permissions": [
    "eventBus:subscribe:detection.started",
    "eventBus:emit:detection.*",
    "sandbox:canvas",
    "storage:write:temp"
  ],

  "dependencies": {
    "kernel": ">=1.0.0",
    "plugin-utils": "^2.1.0"
  },

  "hooks": {
    "onLoad": "onLoad",
    "onActivate": "onActivate",
    "onDeactivate": "onDeactivate",
    "onUnload": "onUnload"
  },

  "resources": {
    "maxMemoryMB": 128,
    "maxExecutionTimeMs": 5000,
    "cpuQuota": 0.1
  }
}
```

### 4.3 Plugin 介面定義

```typescript
// 所有 Plugin 必須實現的介面
interface Plugin {
  readonly manifest: PluginManifest;

  // 生命週期鉤子
  onLoad(kernel: Kernel): Promise<void>;
  onActivate(kernel: Kernel): Promise<void>;
  onDeactivate(kernel: Kernel): Promise<void>;
  onUnload(kernel: Kernel): Promise<void>;
}

// 檢測插件擴展介面
interface DetectionPlugin extends Plugin {
  readonly type: 'detection';

  // 檢測能力聲明
  readonly capabilities: DetectionCapability[];

  // 執行檢測 (在沙箱中運行)
  detect(context: DetectionContext): Promise<DetectionResult>;

  // 結果驗證 (可選)
  validate?(result: DetectionResult): ValidationReport;
}

// 評分規則插件擴展介面
interface ScoringRulePlugin extends Plugin {
  readonly type: 'scoring';

  // 規則元數據
  readonly rule: ScoringRuleMeta;

  // 執行評分
  evaluate(input: ScoringInput): Promise<ScoringOutput>;

  // 是否啟用 (支持動態條件)
  isApplicable?(input: ScoringInput): boolean;
}

// 輸出渠道插件擴展介面
interface OutputChannelPlugin extends Plugin {
  readonly type: 'output';

  // 支持的格式
  readonly supportedFormats: OutputFormat[];

  // 發送輸出
  send(payload: OutputPayload, config: ChannelConfig): Promise<DeliveryResult>;

  // 健康檢查
  healthCheck(): Promise<HealthStatus>;
}
```

---

## 5. 可插拔檢測模組（Detection Plugins）

### 5.1 檢測插件層架構

```
┌─────────────────────────────────────────────────────────────┐
│                    Detection Plugin Layer                    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           Detection Orchestrator (調度器)            │    │
│  │  • 並行/串行策略配置  • 超時熔斷  • 降級策略        │    │
│  └─────────────────────────────────────────────────────┘    │
│                              │                              │
│         ┌────────────────────┼────────────────────┐        │
│         ▼                    ▼                    ▼        │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  硬體指紋組   │    │  網絡環境組   │    │  行為特徵組   │  │
│  │              │    │              │    │              │  │
│  │ • canvas    │    │ • webrtc    │    │ • bot-detect  │  │
│  │ • webgl     │    │ • dns-leak  │    │ • automation  │  │
│  │ • webgpu    │    │ • port-scan │    │ • headless    │  │
│  │ • audio     │    │ • proxy-vpn │    │ • mouse-track │  │
│  │ • fonts     │    │ • tor-exit  │    │ • key-pattern │  │
│  │ • client-rects│   │ • ip-reputation│  │ • scroll-pattern│ │
│  │ • screen    │    │              │    │              │  │
│  │ • touch     │    │              │    │              │  │
│  │ • hardware  │    │              │    │              │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                              │
│  每個 Plugin 獨立沙箱運行，通過 Event Bus 回報結果            │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 內建檢測插件清單 (MVP 階段)

| Plugin ID | 名稱 | 類別 | 執行環境 | 預計耗時 | 優先級 |
|-----------|------|------|---------|---------|--------|
| `detection-canvas` | Canvas 指紋採集 | 硬體指紋 | Client | ~100ms | P0 |
| `detection-webgl` | WebGL 指紋採集 | 硬體指紋 | Client | ~150ms | P0 |
| `detection-webgpu` | WebGPU 指紋採集 | 硬體指紋 | Client | ~100ms | P1 |
| `detection-audio` | Audio 指紋採集 | 硬體指紋 | Client | ~300ms | P0 |
| `detection-fonts` | 字體指紋採集 | 硬體指紋 | Client | ~500ms | P1 |
| `detection-client-rects` | Client Rects 偏差 | 硬體指紋 | Client | ~50ms | P2 |
| `detection-screen` | 螢幕與視口資訊 | 硬體指紋 | Client | ~10ms | P0 |
| `detection-hardware` | 硬體 API (memory/cores) | 硬體指紋 | Client | ~10ms | P0 |
| `detection-webrtc` | WebRTC IP 洩漏檢測 | 網絡環境 | Client+Server | ~800ms | P0 |
| `detection-dns-leak` | DNS 洩漏檢測 | 網絡環境 | Client+Server | ~1000ms | P0 |
| `detection-port-scan` | 端口掃描 (WebSocket) | 網絡環境 | Client | ~2000ms | P1 |
| `detection-proxy-vpn` | 代理/VPN 檢測 | 網絡環境 | Server | ~200ms | P0 |
| `detection-ip-reputation` | IP 信譽查詢 | 網絡環境 | Server | ~100ms | P0 |
| `detection-bot` | Bot/自動化檢測 | 行為特徵 | Client+Server | ~500ms | P0 |
| `detection-timezone` | 時區一致性檢測 | 軟體環境 | Client | ~10ms | P0 |
| `detection-language` | 語言環境檢測 | 軟體環境 | Client | ~10ms | P0 |
| `detection-plugins` | 瀏覽器插件檢測 | 軟體環境 | Client | ~100ms | P2 |

### 5.3 檢測結果標準化 Schema

所有 Detection Plugin 必須回傳統一結構：

```typescript
interface DetectionResult {
  // 元數據
  pluginId: string;
  version: string;
  timestamp: ISO8601String;
  executionTimeMs: number;

  // 狀態
  status: 'success' | 'failed' | 'timeout' | 'skipped' | 'permission_denied';

  // 採集到的原始數據 (Plugin 自定義結構)
  data: unknown;

  // 標準化特徵向量 (用於指紋比對)
  fingerprint?: {
    hash: string;           // SHA-256
    algorithm: string;      // e.g., "canvas-v2"
    entropy: number;        // 0-1, 唯一性分數
    stability: number;      // 0-1, 跨會話穩定性
  };

  // 異常標記 (供 Scoring Plugin 使用)
  anomalies?: Anomaly[];

  // 錯誤資訊
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}

interface Anomaly {
  type: string;             // e.g., "os_mismatch", "canvas_tampered"
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: Record<string, unknown>;
}
```

---

## 6. 可插拔評分規則（Scoring Rule Plugins）

### 6.1 評分引擎架構

```
┌─────────────────────────────────────────────────────────────┐
│                    Scoring Engine Architecture                 │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Scoring Orchestrator                    │    │
│  │  • 規則鏈編排 (Pipeline)  • 權重動態調整             │    │
│  │  • A/B 測試支持          • 規則版本管理               │    │
│  └─────────────────────────────────────────────────────┘    │
│                              │                              │
│         ┌────────────────────┼────────────────────┐        │
│         ▼                    ▼                    ▼        │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  基礎分規則   │    │  風險扣分規則 │    │  加分/調整規則 │  │
│  │              │    │              │    │              │  │
│  │ • base-score │    │ • os-mismatch│    │ • brave-bonus│  │
│  │   (起始100)  │    │ • dns-leak   │    │ • tor-bonus  │  │
│  │              │    │ • webrtc-leak│    │ • vpn-penalty│  │
│  │              │    │ • port-scan  │    │   (反向)      │  │
│  │              │    │ • bot-detect │    │              │  │
│  │              │    │ • blacklisted│    │              │  │
│  │              │    │ • proxy-detect│   │              │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                              │
│  規則執行順序: 基礎分 → 風險扣分 → 加分調整 → 最終分數       │
│  每個 Rule 可配置: 啟用/禁用、權重覆蓋、條件觸發              │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 評分規則 Plugin 清單

| Rule ID | 名稱 | 觸發條件 | 預設扣分 | 可配置 |
|---------|------|---------|---------|--------|
| `rule-base-score` | 基礎分數 | 始終 | +100 (起始) | 是 |
| `rule-canvas-tamper` | Canvas 篡改 | `detection-canvas` 回報篡改 | -5 | 是 |
| `rule-os-mismatch` | 作業系統不一致 | UA OS ≠ 檢測 OS | -5 | 是 |
| `rule-dns-leak` | DNS 洩漏 | `detection-dns-leak` 發現多 DNS | -10 | 是 |
| `rule-webrtc-leak` | WebRTC 洩漏 | `detection-webrtc` 發現本地 IP | -10 | 是 |
| `rule-proxy-detected` | 代理檢測 | `detection-proxy-vpn` 檢測到代理 | -15 | 是 |
| `rule-vpn-detected` | VPN 檢測 | `detection-proxy-vpn` 檢測到 VPN | -10 | 是 |
| `rule-tor-exit` | Tor 出口節點 | IP 在 Tor 出口列表 | -20 | 是 |
| `rule-port-scan-risk` | 高危端口開放 | 22/3389/445 等開放 | -15 | 是 |
| `rule-bot-detected` | Bot 檢測 | `detection-bot` 置信度 > 0.7 | -20 | 是 |
| `rule-blacklisted-ip` | 黑名單 IP | IP 在黑名單庫 | -25 | 是 |
| `rule-timezone-mismatch` | 時區不一致 | IP 時區 ≠ 瀏覽器時區 | -5 | 是 |
| `rule-brave-browser` | Brave 瀏覽器加分 | 檢測到 Brave | +5 | 是 |
| `rule-tor-browser` | Tor 瀏覽器加分 | 檢測到 Tor Browser | +10 | 是 |
| `rule-custom-weight` | 自定義權重規則 | 用戶配置條件 | 自定義 | 是 |

### 6.3 評分規則配置範例

```yaml
# scoring-config.yaml
rules:
  - id: rule-base-score
    enabled: true
    config:
      startingScore: 100

  - id: rule-canvas-tamper
    enabled: true
    config:
      deduction: 5
      # 可配置: 某些篡改視為正常 (如 Brave)
      whitelistVendors: ['Brave Software']

  - id: rule-os-mismatch
    enabled: true
    config:
      deduction: 5
      # 可配置: 允許的 UA 版本偏差
      allowedVersionGap: 2

  - id: rule-dns-leak
    enabled: true
    config:
      deduction: 10
      # 可配置: 允許的 DNS 數量
      maxAllowedDnsServers: 1

  - id: rule-port-scan-risk
    enabled: true
    config:
      # 端口與扣分映射
      portDeductions:
        22: 15    # SSH
        3389: 15  # RDP
        445: 10   # SMB
        3306: 10  # MySQL
      # 可配置: 某些環境允許 (如企業內網)
      ignorePrivateIP: true

  - id: rule-custom-weight
    enabled: true
    config:
      # 用戶自定義條件表達式
      conditions:
        - if: "hardwareConcurrency > 16"
          then: { action: "deduct", value: 5, reason: "異常高核心數，可能為虛擬機" }
        - if: "deviceMemory == null"
          then: { action: "deduct", value: 3, reason: "無法讀取設備記憶體" }
```

### 6.4 評分輸出標準化

```typescript
interface ScoringOutput {
  finalScore: number;           // 0-100
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

  // 評分明細
  breakdown: ScoreBreakdown[];

  // 發現的問題
  issues: ScoredIssue[];

  // 風險摘要
  riskSummary: {
    level: 'low' | 'medium' | 'high' | 'critical';
    primaryConcerns: string[];
    recommendations: string[];
  };
}

interface ScoreBreakdown {
  ruleId: string;
  ruleName: string;
  previousScore: number;
  scoreChange: number;          // 可正可負
  currentScore: number;
  reason: string;
}
```

---

## 7. 可插拔輸出渠道（Output Channel Plugins）

### 7.1 輸出層架構

```
┌─────────────────────────────────────────────────────────────┐
│                    Output Channel Layer                      │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Output Dispatcher                       │    │
│  │  • 格式轉換  • 並行分發  • 重試策略  • 降級機制      │    │
│  └─────────────────────────────────────────────────────┘    │
│                              │                              │
│    ┌─────────┬─────────┬─────────┬─────────┬─────────┐     │
│    ▼         ▼         ▼         ▼         ▼         ▼     │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   │
│ │Console│ │JSON  │ │PDF   │ │Webhook│ │Slack │ │SIEM  │   │
│ │Export │ │Export│ │Export│ │Push   │ │Alert │ │Feed  │   │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘   │
│                                                              │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐     │
│ │Email │ │Ding  │ │WeChat│ │Tele- │ │Pager │ │Custom│     │
│ │SMTP  │ │Talk  │ │Work │ │gram  │ │Duty  │ │API   │     │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘     │
│                                                              │
│ 每個 Output Plugin 獨立配置，支持模板引擎與條件觸發            │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 輸出渠道 Plugin 清單

| Plugin ID | 名稱 | 觸發時機 | 格式 | 異步 |
|-----------|------|---------|------|------|
| `output-console` | 控制台輸出 | 開發調試 | 文字/JSON | 否 |
| `output-json-export` | JSON 報告匯出 | 用戶下載 | JSON | 否 |
| `output-pdf-export` | PDF 報告生成 | 用戶下載 | PDF | 是 |
| `output-html-export` | HTML 報告生成 | 用戶下載 | HTML | 是 |
| `output-webhook` | HTTP Webhook | 評分完成 | JSON | 是 |
| `output-slack` | Slack 通知 | 高風險檢測 | Markdown | 是 |
| `output-dingtalk` | 釘釘通知 | 高風險檢測 | Markdown | 是 |
| `output-wecom` | 企業微信 | 高風險檢測 | Markdown | 是 |
| `output-email-smtp` | SMTP 郵件 | 用戶訂閱 | HTML | 是 |
| `output-siem-splunk` | Splunk HEC | 實時 | JSON | 是 |
| `output-siem-elastic` | Elasticsearch | 實時 | JSON | 是 |
| `output-siem-datadog` | Datadog | 實時 | JSON | 是 |

### 7.3 輸出配置範例

```yaml
# output-config.yaml
channels:
  - id: output-pdf-export
    enabled: true
    config:
      template: "default-report-v2"
      includeScreenshots: true
      watermark: "FingerScan Confidential"
      retentionDays: 7

  - id: output-webhook
    enabled: true
    config:
      url: "https://hooks.example.com/fingerscan"
      method: POST
      headers:
        Authorization: "Bearer ${WEBHOOK_TOKEN}"
      retryPolicy:
        maxRetries: 3
        backoff: exponential
      # 條件觸發
      trigger:
        condition: "score < 70 OR issues.any(i => i.severity == 'critical')"

  - id: output-slack
    enabled: true
    config:
      webhookUrl: "${SLACK_WEBHOOK_URL}"
      channel: "#security-alerts"
      username: "FingerScan Bot"
      # 模板使用 Handlebars
      template: |
        🚨 *瀏覽器指紋檢測警報*

        • IP: {{ipAddress}}
        • 評分: {{finalScore}}/100 ({{grade}})
        • 風險等級: {{riskSummary.level}}
        • 檢測時間: {{timestamp}}

        {{#each issues}}
        • {{severity}}: {{description}}
        {{/each}}
      trigger:
        condition: "score < 60"
```

---

## 8. 多平台協同 SDK（Cross-Platform SDK）

### 8.1 SDK 設計目標

提供**統一的採集協議**與**統一的通信協議**，讓 Web、Extension、CLI、Mobile 共享同一套 Plugin 生態。

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cross-Platform SDK Stack                    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Unified Protocol Layer                    │    │
│  │  • 消息序列化 (Protobuf / JSON)                        │    │
│  │  • 加密傳輸 (TLS 1.3 + mTLS)                           │    │
│  │  • 壓縮與分片                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│    ┌─────────────┬─────────────┬─────────────┬─────────────┐     │
│    ▼             ▼             ▼             ▼             ▼     │
│ ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐   │
│ │Web SDK │  │Chrome  │  │Node.js │  │Mobile  │  │Python  │   │
│ │(ESM/  │  │Extension│  │CLI/Lib │  │SDK     │  │SDK     │   │
│ │UMD)   │  │SDK     │  │       │  │(iOS/   │  │       │   │
│ │       │  │       │  │       │  │Android)│  │       │   │
│ └────────┘  └────────┘  └────────┘  └────────┘  └────────┘   │
│                                                                  │
│ 每個平台 SDK 封裝: 採集引擎 + Plugin Runtime + 網絡客戶端          │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 SDK 架構 (以 Web SDK 為例)

```typescript
// fingerscan-sdk-web

class FingerScanSDK {
  private kernel: Kernel;
  private pluginLoader: RemotePluginLoader;
  private transport: Transport;

  constructor(config: SDKConfig) {
    // 1. 初始化核心
    this.kernel = new Kernel(config.kernel);

    // 2. 初始化傳輸層
    this.transport = new WebSocketTransport(config.endpoint);

    // 3. 加載遠程 Plugin
    this.pluginLoader = new RemotePluginLoader({
      registryUrl: config.pluginRegistry,
      autoUpdate: true,
    });
  }

  // 核心 API
  async scan(options: ScanOptions = {}): Promise<ScanSession> {
    const session = new ScanSession(this.kernel, this.transport);

    // 動態加載本次掃描需要的 Plugin
    const plugins = await this.pluginLoader.resolve(options.plugins);
    await session.loadPlugins(plugins);

    // 執行掃描
    return session.start();
  }

  // 獲取已安裝 Plugin 列表
  getInstalledPlugins(): PluginInfo[] {
    return this.kernel.pluginManager.list();
  }

  // 動態安裝 Plugin (熱更新)
  async installPlugin(manifestUrl: string): Promise<void> {
    const manifest = await fetch(manifestUrl).then(r => r.json());
    await this.kernel.pluginManager.load(manifest);
  }
}

// 使用範例
const sdk = new FingerScanSDK({
  endpoint: 'wss://api.fingerscan.io/v1/scan',
  pluginRegistry: 'https://plugins.fingerscan.io/registry.json',
  apiKey: 'fsk_xxxxxxxx',
});

const session = await sdk.scan({
  plugins: ['detection-canvas', 'detection-webgl', 'detection-webrtc'],
  timeout: 10000,
});

session.onProgress((event) => {
  console.log(`${event.pluginId}: ${event.percent}%`);
});

const report = await session.waitForCompletion();
console.log(report.privacyScore);
```

### 8.3 各平台 SDK 能力矩陣

| 能力 | Web SDK | Chrome Ext | Node.js CLI | iOS SDK | Android SDK |
|------|---------|-----------|-------------|---------|-------------|
| Canvas 指紋 | ✅ | ✅ | ❌ | ❌ | ❌ |
| WebGL 指紋 | ✅ | ✅ | ❌ | ❌ | ❌ |
| WebGPU 指紋 | ✅ | ✅ | ❌ | ❌ | ❌ |
| Audio 指紋 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 字體指紋 | ✅ | ✅ | ❌ | ❌ | ❌ |
| WebRTC 洩漏 | ✅ | ✅ | ✅ | ✅ | ✅ |
| DNS 洩漏 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 端口掃描 | ✅ | ✅ | ✅ | ✅ | ✅ |
| IP 信譽查詢 | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bot 檢測 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 系統級指紋 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 網絡接口枚舉 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 設備硬體資訊 | ❌ | ❌ | ✅ | ✅ | ✅ |
| 本地文件訪問 | ❌ | ✅ (經授權) | ✅ | ❌ | ❌ |
| Plugin 熱加載 | ✅ | ✅ | ✅ | ⚠️ (需審核) | ⚠️ (需審核) |

### 8.4 平台適配層 (Platform Adapter)

對於各平台差異能力，通過**適配器 Plugin** 解決：

```typescript
// 平台適配器介面
interface PlatformAdapter extends Plugin {
  readonly platform: 'web' | 'chrome-extension' | 'nodejs' | 'ios' | 'android';

  // 能力聲明
  getCapabilities(): PlatformCapability[];

  // 執行平台特定操作
  execute<T>(operation: PlatformOperation): Promise<T>;
}

// 範例: Chrome Extension 適配器
class ChromeExtensionAdapter implements PlatformAdapter {
  readonly platform = 'chrome-extension';

  getCapabilities() {
    return [
      'system.cpu',
      'system.memory',
      'system.storage',
      'network.interfaces',
      'tabs.access',
      'cookies.access',
    ];
  }

  async execute(operation) {
    switch (operation.type) {
      case 'system.cpu':
        return chrome.system.cpu.getInfo();
      case 'network.interfaces':
        return new Promise((resolve) => {
          chrome.system.network.getNetworkInterfaces(resolve);
        });
      // ...
    }
  }
}
```

---

## 9. 資料流與事件總線

### 9.1 完整檢測流程資料流

```
用戶點擊「開始檢測」
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 1: 初始化 (Init)                                        │
│  ┌─────────────┐                                                │
│  │ SDK 初始化   │ ──→ kernel.bootstrap()                        │
│  │ 載入 Plugin  │ ──→ pluginManager.load(manifests)             │
│  │ 建立 WS 連線 │ ──→ transport.connect()                       │
│  └─────────────┘                                                │
│       │ emit: kernel.bootstrap.completed                         │
└───────┼───────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 2: 並行檢測 (Detection)                                   │
│                                                                  │
│  eventBus.emit('detection.started')                              │
│       │                                                          │
│       ├──→ detection-canvas  (Client Sandbox, 100ms)            │
│       │    emit: detection.canvas.completed → Result A           │
│       │                                                          │
│       ├──→ detection-webgl   (Client Sandbox, 150ms)            │
│       │    emit: detection.webgl.completed → Result B            │
│       │                                                          │
│       ├──→ detection-webrtc  (Client+Server, 800ms)             │
│       │    emit: detection.webrtc.completed → Result C           │
│       │                                                          │
│       ├──→ detection-dns-leak (Client+Server, 1000ms)           │
│       │    emit: detection.dns-leak.completed → Result D        │
│       │                                                          │
│       └──→ detection-port-scan (Client, 2000ms)                 │
│            emit: detection.port-scan.completed → Result E        │
│                                                                  │
│  (所有 Plugin 完成後)                                             │
│  emit: detection.all.completed { results: [A,B,C,D,E] }          │
└───────┼───────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 3: 評分計算 (Scoring)                                     │
│                                                                  │
│  eventBus.emit('scoring.started')                                │
│       │                                                          │
│       ├──→ rule-base-score: score = 100                          │
│       ├──→ rule-canvas-tamper: score -= 5 (if tampered)           │
│       ├──→ rule-os-mismatch: score -= 5 (if mismatch)            │
│       ├──→ rule-dns-leak: score -= 10 (if leaked)               │
│       ├──→ rule-webrtc-leak: score -= 10 (if leaked)            │
│       └──→ ... (所有 Rule 依次執行)                              │
│                                                                  │
│  emit: scoring.completed { score, grade, issues, breakdown }       │
└───────┼───────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 4: 輸出分發 (Output)                                      │
│                                                                  │
│  eventBus.emit('output.started')                                 │
│       │                                                          │
│       ├──→ output-console: 打印到開發者控制台                     │
│       ├──→ output-json-export: 生成 JSON 文件                     │
│       ├──→ output-webhook: POST 到用戶服務器 (if score < 70)    │
│       └──→ output-slack: 發送警報 (if critical issue)           │
│                                                                  │
│  emit: output.all.completed                                       │
└───────┼───────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 5: 持久化 (Persistence)                                   │
│                                                                  │
│  • PostgreSQL: 報告主體、用戶關聯                                  │
│  • Redis: 熱點 IP 快取、會話狀態                                  │
│  • ClickHouse: 指紋時序數據、趨勢分析                              │
│  • S3/MinIO: PDF/HTML 報告文件、原始數據快照                       │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 事件優先級與併發控制

```typescript
// 事件優先級隊列
const EventPriorities = {
  CRITICAL: 0,    // kernel.error.critical, 熔斷事件
  HIGH: 1,        // detection.*.completed, scoring.completed
  NORMAL: 2,      // detection.*.progress, output.*.sending
  LOW: 3,         // logging, metrics
  BACKGROUND: 4,  // analytics, cleanup
};

// 檢測 Plugin 併發策略
const DetectionConcurrency = {
  // 硬體指紋組: 可並行 (無副作用)
  hardware: { maxConcurrency: 10, strategy: 'parallel' },

  // 網絡環境組: 部分串行 (避免網絡擁塞)
  network: { maxConcurrency: 3, strategy: 'parallel-throttled' },

  // 端口掃描: 嚴格串行 (避免被 WAF 封鎖)
  portscan: { maxConcurrency: 1, strategy: 'sequential' },
};
```

---

## 10. 部署架構

### 10.1 生產環境拓撲

```
┌─────────────────────────────────────────────────────────────────┐
│                        CDN 層 (Cloudflare)                       │
│  • 靜態資源加速 (SDK, Plugin 包)                                 │
│  • DDoS 防護                                                     │
│  • WAF 規則                                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                      Load Balancer (Nginx / Traefik)             │
│  • SSL 終止  • 流量分配  • 健康檢查                               │
└─────────────────────────────┬───────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  API Server   │    │  API Server   │    │  API Server   │
│  (Node.js /  │    │  (Node.js /  │    │  (Node.js /  │
│   Go)         │    │   Go)         │    │   Go)         │
│               │    │               │    │               │
│ • Kernel Core │    │ • Kernel Core │    │ • Kernel Core │
│ • Plugin Mgmt │    │ • Plugin Mgmt │    │ • Plugin Mgmt │
│ • REST API    │    │ • REST API    │    │ • REST API    │
│ • WS Handler  │    │ • WS Handler  │    │ • WS Handler  │
└───────┬───────┘    └───────┬───────┘    └───────┬───────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      共享服務層 (Shared Services)                 │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐│
│  │ Redis Cluster│  │ PostgreSQL  │  │    ClickHouse Cluster    ││
│  │             │  │  Primary    │  │                          ││
│  │ • 會話快取   │  │  + Replicas │  │ • 時序數據               ││
│  │ • 指紋快取   │  │             │  │ • 趨勢分析               ││
│  │ • 任務隊列   │  │ • 報告數據  │  │ • 大數據查詢             ││
│  │ • 分布式鎖   │  │ • 用戶數據  │  │                          ││
│  └─────────────┘  └─────────────┘  └─────────────────────────┘│
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐│
│  │ S3 / MinIO  │  │ Elasticsearch│  │   Kafka / RabbitMQ      ││
│  │             │  │             │  │                          ││
│  │ • 報告文件  │  │ • 黑名單搜尋 │  │ • 事件流                ││
│  │ • Plugin 包 │  │ • 日誌搜尋   │  │ • 異步任務              ││
│  │ • 備份      │  │             │  │                          ││
│  └─────────────┘  └─────────────┘  └─────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 容器化部署 (Docker Compose 開發版)

```yaml
# docker-compose.yml (開發環境)
version: '3.8'

services:
  # 核心 API 服務
  api:
    build: ./services/api
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/fingerscan
      - REDIS_URL=redis://redis:6379
      - CLICKHOUSE_URL=http://clickhouse:8123
    volumes:
      - ./plugins:/app/plugins:ro
      - ./config:/app/config:ro
    depends_on:
      - postgres
      - redis
      - clickhouse

  # WebSocket 服務 (可獨立擴展)
  ws:
    build: ./services/ws
    ports:
      - "3001:3001"
    environment:
      - REDIS_URL=redis://redis:6379
      - API_URL=http://api:3000
    depends_on:
      - redis

  # 任務處理器 (Plugin 執行沙箱)
  worker:
    build: ./services/worker
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/fingerscan
    depends_on:
      - redis
      - postgres

  # 數據庫
  postgres:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=fingerscan
      - POSTGRES_PASSWORD=password

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  clickhouse:
    image: clickhouse/clickhouse-server:latest
    volumes:
      - clickhouse_data:/var/lib/clickhouse

volumes:
  postgres_data:
  redis_data:
  clickhouse_data:
```

---

## 11. 開發規範與 Plugin API

### 11.1 Plugin 開發快速開始

```bash
# 1. 安裝 CLI 工具
npm install -g @fingerscan/plugin-cli

# 2. 創建檢測 Plugin
fsc plugin create detection-my-feature
# → 生成標準 Plugin 模板

# 3. 實現核心邏輯
cd detection-my-feature
# 編輯 src/index.ts

# 4. 本地測試
fsc plugin test --kernel ../../kernel-dev

# 5. 打包發布
fsc plugin build
fsc plugin publish --registry https://plugins.fingerscan.io
```

### 11.2 Plugin 最小實現範例

```typescript
// detection-canvas/src/index.ts
import { DetectionPlugin, DetectionContext, DetectionResult } from '@fingerscan/sdk';

export default class CanvasDetectionPlugin implements DetectionPlugin {
  readonly manifest = {
    id: 'detection-canvas',
    type: 'detection',
    version: '1.0.0',
    // ...
  };

  async onLoad(kernel) {
    // 註冊到檢測調度器
    kernel.eventBus.on('detection.started', () => this.detect());
  }

  async detect(context: DetectionContext): Promise<DetectionResult> {
    const startTime = performance.now();

    try {
      // 1. 繪製測試圖案
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = 200;
      canvas.height = 50;

      // 文字測試
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f60';
      ctx.fillRect(0, 0, 200, 50);
      ctx.fillStyle = '#069';
      ctx.font = '16px Arial';
      ctx.fillText('FingerScan v1.0 🎨', 10, 30);

      // 2. 生成雜湊
      const dataUrl = canvas.toDataURL();
      const hash = await sha256(dataUrl);

      // 3. 檢測篡改 (比對函數 toString)
      const isTampered = this.detectTampering();

      // 4. 回傳標準結果
      return {
        pluginId: this.manifest.id,
        version: this.manifest.version,
        timestamp: new Date().toISOString(),
        executionTimeMs: performance.now() - startTime,
        status: 'success',
        data: {
          hash,
          dataUrlLength: dataUrl.length,
          isTampered,
          tamperingEvidence: isTampered ? this.getTamperingEvidence() : null,
        },
        fingerprint: {
          hash,
          algorithm: 'canvas-v2-sha256',
          entropy: 0.95,
          stability: 0.85,
        },
        anomalies: isTampered ? [{
          type: 'canvas_tampered',
          severity: 'low',
          description: '檢測到 Canvas 函數被修改，可能是隱私保護瀏覽器',
          evidence: { modifiedFunctions: this.getTamperingEvidence() },
        }] : [],
      };

    } catch (error) {
      return {
        pluginId: this.manifest.id,
        version: this.manifest.version,
        timestamp: new Date().toISOString(),
        executionTimeMs: performance.now() - startTime,
        status: 'failed',
        data: null,
        error: {
          code: 'CANVAS_ACCESS_DENIED',
          message: error.message,
          recoverable: false,
        },
      };
    }
  }

  private detectTampering(): boolean {
    const origToString = HTMLCanvasElement.prototype.toDataURL.toString();
    return origToString !== 'function toDataURL() { [native code] }';
  }
}
```

### 11.3 Plugin 安全沙箱規範

```typescript
// 沙箱權限模型
interface SandboxPolicy {
  // 網絡權限
  network: {
    allowDomains: string[];      // 允許訪問的域名白名單
    allowWebSocket: boolean;
    maxRequestsPerSecond: number;
  };

  // DOM 權限
  dom: {
    allowCreateElement: boolean;
    allowedTags: string[];       // 允許創建的標籤
    allowCanvas: boolean;
    allowWebGL: boolean;
    allowAudioContext: boolean;
  };

  // 存儲權限
  storage: {
    allowLocalStorage: boolean;
    allowSessionStorage: boolean;
    allowIndexedDB: boolean;
    maxStorageBytes: number;
  };

  // 計算資源
  compute: {
    maxExecutionTimeMs: number;
    maxMemoryMB: number;
    allowWorkers: boolean;
  };
}

// 檢測 Plugin 預設沙箱策略
const DefaultDetectionSandbox: SandboxPolicy = {
  network: {
    allowDomains: [],           // 默認不允許外網 (純本地採集)
    allowWebSocket: false,
    maxRequestsPerSecond: 0,
  },
  dom: {
    allowCreateElement: true,
    allowedTags: ['canvas', 'div', 'span', 'audio', 'video'],
    allowCanvas: true,
    allowWebGL: true,
    allowAudioContext: true,
  },
  storage: {
    allowLocalStorage: false,
    allowSessionStorage: false,
    allowIndexedDB: false,
    maxStorageBytes: 0,
  },
  compute: {
    maxExecutionTimeMs: 5000,
    maxMemoryMB: 128,
    allowWorkers: true,
  },
};
```

---

## 12. Roadmap（0-1 里程碑）

### Phase 0: 內核鑄造 (Week 1-2)

| 任務 | 驗收標準 |
|------|---------|
| Kernel 核心實現 | Event Bus、Plugin Loader、Config Center、Lifecycle Manager 單元測試通過 |
| Plugin Manifest 規範 | Schema 定稿，CLI 工具可驗證 |
| 沙箱機制原型 | 可限制 Plugin 的 DOM/網絡/計算資源 |
| 開發環境 | `docker-compose up` 一鍵啟動完整開發環境 |

### Phase 1: MVP 插件集 (Week 3-4)

| 任務 | 驗收標準 |
|------|---------|
| 檢測 Plugin × 8 | canvas, webgl, audio, screen, hardware, webrtc, dns-leak, proxy-vpn |
| 評分 Rule Plugin × 6 | base-score, canvas-tamper, os-mismatch, dns-leak, webrtc-leak, bot-detect |
| 輸出 Plugin × 3 | console, json-export, webhook |
| Web SDK v1 | ESM 打包，可在瀏覽器運行完整檢測流程 |
| 端到端測試 | 從採集 → 評分 → 輸出，全流程自動化測試通過 |

### Phase 2: 平台擴展 (Week 5-6)

| 任務 | 驗收標準 |
|------|---------|
| Chrome Extension SDK | 可訪問系統級 API，支持 background script 採集 |
| Node.js CLI | 命令行工具，支持批量 IP 檢測與 CI 集成 |
| 輸出 Plugin × 4 | pdf-export, slack, email, siem-elastic |
| Plugin Marketplace 原型 | 可上傳、下載、安裝 Plugin |

### Phase 3: 生產就緒 (Week 7-8)

| 任務 | 驗收標準 |
|------|---------|
| 性能優化 | 單次完整檢測 < 3s (P95) |
| 安全加固 | Plugin 簽名驗證、沙箱逃逸測試、滲透測試通過 |
| 監控告警 | Prometheus + Grafana 儀表板，關鍵指標告警 |
| 文檔完善 | API 文檔、Plugin 開發指南、部署手冊齊全 |
| 開源發布 | GitHub 公開，MIT 協議，含貢獻指南 |

---

## 附錄

### A. 術語表

| 術語 | 定義 |
|------|------|
| **Kernel** | 核心平台，僅包含基礎設施，無業務邏輯 |
| **Plugin** | 插件，自包含的業務功能單元，通過 Manifest 聲明 |
| **Detection Plugin** | 檢測插件，負責採集某一維度的指紋或環境數據 |
| **Scoring Rule Plugin** | 評分規則插件，根據檢測結果計算扣分/加分 |
| **Output Channel Plugin** | 輸出渠道插件，負責將結果分發到不同終端 |
| **Event Bus** | 事件總線，所有跨模組通信的唯一通道 |
| **Sandbox** | 沙箱，Plugin 的運行時資源與權限隔離環境 |
| **SDK** | 軟體開發套件，封裝 Kernel + Runtime + Transport |

### B. 參考資料

- [DeepSeek Harness Plugin System](https://github.com/deepseek-ai/DeepSeek-Harness)
- [Browser Fingerprinting Survey (IEEE 2023)](https://ieeexplore.ieee.org/document/)
- [W3C Device Memory API](https://w3c.github.io/device-memory/)
- [MaxMind GeoIP2 Precision](https://dev.maxmind.com/geoip/docs/web-services)

---

> **本文件為 0-1 階段架構規劃，所有技術選型與數值均為初始設計，實際開發中應根據性能測試與安全審計結果進行調整。**
