/**
 * 首頁區塊設定（管理者可自訂 + 記憶）。
 * 設定存 localStorage，跨次開啟一致；之後可換成後端 API。
 */

export interface HomeBlock {
  id: string;
  label: string;
  icon: string;
  visible: boolean;
  enabled: boolean;
  order: number;
}

export interface HomeConfig {
  version: 1;
  blocks: HomeBlock[];
}

export const DEFAULT_HOME_CONFIG: HomeConfig = {
  version: 1,
  blocks: [
    { id: 'home.header', label: '頂部入口連結', icon: '🔗', visible: true, enabled: true, order: 0 },
    { id: 'home.consent', label: '資料使用同意', icon: '📋', visible: true, enabled: true, order: 1 },
    { id: 'home.scan', label: '一鍵掃描', icon: '🔍', visible: true, enabled: true, order: 2 },
    { id: 'result.score', label: '分數摘要（雙軌＋因素）', icon: '🎯', visible: true, enabled: true, order: 3 },
    { id: 'result.issues', label: '異常與風險', icon: '🚨', visible: true, enabled: true, order: 4 },
    { id: 'result.hardware', label: '硬體指紋', icon: '🧬', visible: true, enabled: true, order: 5 },
    { id: 'result.browser', label: '瀏覽器環境', icon: '🖥️', visible: true, enabled: true, order: 6 },
    { id: 'result.network', label: '網路環境', icon: '🌐', visible: true, enabled: true, order: 7 },
    { id: 'result.next', label: '下一步 CTA', icon: '➡️', visible: true, enabled: true, order: 8 },
    { id: 'home.footer', label: '頁尾連結', icon: '🦶', visible: true, enabled: true, order: 9 },
  ],
};

const STORAGE_KEY = 'shieldscan.homepage.v1';

export function isHomeConfigLike(value: unknown): value is HomeConfig {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as HomeConfig;
  return candidate.version === 1 && Array.isArray(candidate.blocks);
}

export function loadHomeConfig(): HomeConfig {
  if (typeof window === 'undefined') return DEFAULT_HOME_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_HOME_CONFIG;
    const parsed: unknown = JSON.parse(raw);
    if (!isHomeConfigLike(parsed)) return DEFAULT_HOME_CONFIG;
    // 合併預設：新區塊自動出現、舊區塊保留設定
    const byId = new Map(parsed.blocks.map((block) => [block.id, block]));
    return {
      version: 1,
      blocks: DEFAULT_HOME_CONFIG.blocks.map((block) => ({ ...byId.get(block.id) ?? block })),
    };
  } catch {
    return DEFAULT_HOME_CONFIG;
  }
}

export function saveHomeConfig(config: HomeConfig): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetHomeConfig(): HomeConfig {
  window.localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_HOME_CONFIG;
}

export function toggleHomeFlag(config: HomeConfig, id: string, flag: 'visible' | 'enabled') {
  return {
    ...config,
    blocks: config.blocks.map((block) =>
      block.id === id ? { ...block, [flag]: !block[flag] } : block,
    ),
  };
}

export function moveHomeBlock(config: HomeConfig, id: string, direction: -1 | 1) {
  const sorted = [...config.blocks].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((block) => block.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= sorted.length) return config;
  const next = sorted.map((block) => ({ ...block }));
  const current = next[index];
  const neighbor = next[target];
  if (!current || !neighbor) return config;
  const order = current.order;
  current.order = neighbor.order;
  neighbor.order = order;
  return { ...config, blocks: next };
}

export function blockById(config: HomeConfig, id: string): HomeBlock | undefined {
  return config.blocks.find((block) => block.id === id);
}
