/**
 * ShieldScan 工作台「模組目錄」— 單一事實來源（Single Source of Truth）。
 *
 * 對應總綱原則：Everything-is-a-Plugin。
 * 中期會改由 Plugin Registry（packages/plugin-runtime）動態供應，
 * 此檔案先以 typed catalog 提供可預期、可測試的 MVP 版本。
 */

export type ModuleKind =
  | 'detection' // 採集/偵測（browser-sdk 訊號）
  | 'analysis' // 分析（IP/ASN/網路信任等）
  | 'scoring' // 評分（分數、等級、風險維度）
  | 'policy' // 政策（allow/review/challenge/block）
  | 'output'; // 輸出（報告明細、匯出）

export interface ModuleCategory {
  id: string;
  label: string;
  icon: string;
  order: number;
  /** 介面是否顯示整個分類 */
  visible: boolean;
  /** 左側欄分類是否收合 */
  collapsed: boolean;
}

export interface ModuleItem {
  id: string;
  categoryId: string;
  label: string;
  icon: string;
  description: string;
  kind: ModuleKind;
  /** 功能是否參與掃描／分析 */
  enabled: boolean;
  /** UI 是否顯示（關閉仍可能參與，但看不到） */
  visible: boolean;
  /** 分類內排序 */
  order: number;
}

export interface WorkspaceConfig {
  version: 1;
  categories: ModuleCategory[];
  modules: ModuleItem[];
}

export const KIND_LABEL: Record<ModuleKind, string> = {
  detection: '採集',
  analysis: '分析',
  scoring: '評分',
  policy: '政策',
  output: '輸出',
};

export const DEFAULT_CONFIG: WorkspaceConfig = {
  version: 1,
  categories: [
    { id: 'overview', label: '綜合評分', icon: '📊', order: 0, visible: true, collapsed: false },
    { id: 'browser', label: '瀏覽器與隱私', icon: '🖥️', order: 1, visible: true, collapsed: false },
    { id: 'network', label: '網路環境', icon: '🌐', order: 2, visible: true, collapsed: false },
    { id: 'report', label: '報告輸出', icon: '📄', order: 3, visible: true, collapsed: false },
  ],
  modules: [
    // —— 綜合評分 ——
    {
      id: 'overview.score',
      categoryId: 'overview',
      label: '總分與風險等級',
      icon: '🎯',
      description: '單一總分（0–100）、等級與風險摘要。',
      kind: 'scoring',
      enabled: true,
      visible: true,
      order: 0,
    },
    {
      id: 'overview.dimensions',
      categoryId: 'overview',
      label: '四維評分',
      icon: '📐',
      description: '隱私暴露、環境真實性、自動化風險、網路信任。',
      kind: 'scoring',
      enabled: true,
      visible: true,
      order: 1,
    },
    // —— 瀏覽器與隱私（對應 browser-sdk 採集模組，id 即 plugin id）——
    ...(
      [
        ['browser.ua', '👤', 'User-Agent / Platform'],
        ['browser.clientHints', '🧩', 'Client Hints'],
        ['browser.canvas', '🎨', 'Canvas 指紋'],
        ['browser.webgl', '🧊', 'WebGL'],
        ['browser.webgpu', '⚡', 'WebGPU'],
        ['browser.audio', '🔊', 'Audio 指紋'],
        ['browser.screen', '🖥️', '螢幕資訊'],
        ['browser.locale', '🌏', '語言與區域'],
        ['browser.timezone', '🕐', '時區'],
        ['browser.webrtc', '🔌', 'WebRTC 本地 IP'],
      ] as const
    ).map(([id, icon, label], index) => ({
      id,
      categoryId: 'browser',
      label,
      icon,
      description: '瀏覽器端環境訊號採集（browser-sdk detection plugin）。',
      kind: 'detection' as const,
      enabled: true,
      visible: true,
      order: index,
    })),
    // —— 網路環境 ——
    {
      id: 'network.ip',
      categoryId: 'network',
      label: '出口 IP / 網路分析',
      icon: '🌍',
      description: '伺服器端以來源 IP 分析的網路信任資訊。',
      kind: 'analysis',
      enabled: true,
      visible: true,
      order: 0,
    },
    // —— 報告輸出 ——
    {
      id: 'report.detail',
      categoryId: 'report',
      label: '檢測報告明細',
      icon: '🗂️',
      description: '完整環境報告（訊號、問題、政策與網路判讀）。',
      kind: 'output',
      enabled: true,
      visible: true,
      order: 0,
    },
    {
      id: 'report.export',
      categoryId: 'report',
      label: 'JSON 匯出',
      icon: '⬇️',
      description: '把標準化 EnvironmentReport 下載成 JSON。',
      kind: 'output',
      enabled: true,
      visible: true,
      order: 1,
    },
  ],
};

export function cloneDefaultConfig(): WorkspaceConfig {
  return {
    version: 1,
    categories: DEFAULT_CONFIG.categories.map((c) => ({ ...c })),
    modules: DEFAULT_CONFIG.modules.map((m) => ({ ...m })),
  };
}
