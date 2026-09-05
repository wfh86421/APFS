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
  | 'output' // 輸出（報告明細、匯出）
  | 'governance'; // 治理（RBAC / 審計 / 保留）

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
  /** 權限等級：restricted 表示需高權限（例如治理抽屜） */
  accessLevel?: 'normal' | 'restricted';
  /** 分類內排序 */
  order: number;
}

export interface WorkspaceConfig {
  version: 2;
  categories: ModuleCategory[];
  modules: ModuleItem[];
}

export const KIND_LABEL: Record<ModuleKind, string> = {
  detection: '採集',
  analysis: '分析',
  scoring: '評分',
  policy: '政策',
  output: '輸出',
  governance: '治理',
};

export const DEFAULT_CONFIG: WorkspaceConfig = {
  version: 2,
  categories: [
    { id: 'decision', label: '決策樞紐', icon: '⚖️', order: 0, visible: true, collapsed: false },
    { id: 'risk', label: '異常矩陣', icon: '🚨', order: 1, visible: true, collapsed: false },
    { id: 'network', label: '網路地理', icon: '🌍', order: 2, visible: true, collapsed: false },
    { id: 'hardware', label: '硬體指紋', icon: '🧬', order: 3, visible: true, collapsed: false },
    { id: 'browser', label: '瀏覽器環境', icon: '🖥️', order: 4, visible: true, collapsed: false },
    { id: 'raw', label: '原始與稽核', icon: '🗃️', order: 5, visible: true, collapsed: false },
    { id: 'governance', label: '治理', icon: '🛡️', order: 6, visible: true, collapsed: false },
  ],
  modules: [
    // ① 決策樞紐與快速處置
    {
      id: 'decision.verdict',
      categoryId: 'decision',
      label: '決策樞紐與快速處置',
      icon: '⚖️',
      description: '0.5–3 秒決策：訪客/評分/風險因素/建議動作/白名單黑名單。',
      kind: 'policy',
      enabled: true,
      visible: true,
      order: 0,
    },
    // ② 異常與一致性矩陣
    {
      id: 'risk.conflicts',
      categoryId: 'risk',
      label: '異常與一致性矩陣',
      icon: '🔍',
      description: '宣稱 vs 事實 vs 判定：OS/端口/DNS/WebRTC/Canvas/地理。',
      kind: 'analysis',
      enabled: true,
      visible: true,
      order: 1,
    },
    // ③ 網路、IP 與地理
    {
      id: 'network.geo',
      categoryId: 'network',
      label: '網路、IP 與地理',
      icon: '🌐',
      description: 'IP/ISP/7天活躍、WebRTC/STUN、DNS 洩漏、開放端口、地理卡與時區矩陣。',
      kind: 'analysis',
      enabled: true,
      visible: true,
      order: 0,
    },
    // ④ 硬體與設備指紋
    {
      id: 'hardware.fp',
      categoryId: 'hardware',
      label: '硬體與設備指紋',
      icon: '🧬',
      description: 'GPU/CPU/RAM/螢幕/觸控與 Canvas/WebGL/Audio/Fonts 指紋群。',
      kind: 'detection',
      enabled: true,
      visible: true,
      order: 0,
    },
    // ⑤ 瀏覽器與軟體環境
    {
      id: 'browser.env',
      categoryId: 'browser',
      label: '瀏覽器與軟體環境',
      icon: '🖥️',
      description: 'OS/瀏覽器/UA 比對/語言/字體/無痕/外掛狀態。',
      kind: 'detection',
      enabled: true,
      visible: true,
      order: 0,
    },
    // ⑥ 原始資料與稽核抽屜（預設隱藏但仍參與）
    {
      id: 'raw.payload',
      categoryId: 'raw',
      label: '原始資料與稽核抽屜',
      icon: '🗃️',
      description: 'Raw JSON/版本/consent/retention；預設收合，存取需高權限並記錄。',
      kind: 'output',
      enabled: true,
      visible: false,
      order: 0,
    },
    // ⑦ 治理抽屜（restricted，預設不顯示）
    {
      id: 'governance.audit',
      categoryId: 'governance',
      label: '治理（RBAC/審計/保留）',
      icon: '🛡️',
      description: 'RBAC 遮罩、審計日誌、保留策略、刪除流程、模型版本。',
      kind: 'governance',
      enabled: true,
      visible: false,
      accessLevel: 'restricted',
      order: 0,
    },
  ],
};

export function cloneDefaultConfig(): WorkspaceConfig {
  return {
    version: 2,
    categories: DEFAULT_CONFIG.categories.map((c) => ({ ...c })),
    modules: DEFAULT_CONFIG.modules.map((m) => ({ ...m })),
  };
}
