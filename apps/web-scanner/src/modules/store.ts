/**
 * 工作台設定的讀寫與不可變更新邏輯。
 *
 * MVP 先以 localStorage 保存（每台瀏覽器各自一份）；
 * 後續換成 API + PostgreSQL 時，只需把 loadWorkspaceConfig /
 * saveWorkspaceConfig 換成遠端呼叫，元件不需要改。
 */

import type { WorkspaceConfig } from './catalog';
import { cloneDefaultConfig } from './catalog';

const STORAGE_KEY = 'shieldscan.admin.workspace.v1';

function isWorkspaceConfig(value: unknown): value is WorkspaceConfig {
  if (!value || typeof value !== 'object') return false;
  const v = value as WorkspaceConfig;
  return v.version === 2 && Array.isArray(v.categories) && Array.isArray(v.modules);
}

export function loadWorkspaceConfig(): WorkspaceConfig {
  if (typeof window === 'undefined') return cloneDefaultConfig();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaultConfig();
    const parsed: unknown = JSON.parse(raw);
    if (!isWorkspaceConfig(parsed)) return cloneDefaultConfig();
    return parsed;
  } catch {
    return cloneDefaultConfig();
  }
}

export function saveWorkspaceConfig(config: WorkspaceConfig): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetWorkspaceConfig(): WorkspaceConfig {
  if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
  return cloneDefaultConfig();
}

export function toggleModuleFlag(
  config: WorkspaceConfig,
  moduleId: string,
  flag: 'enabled' | 'visible',
): WorkspaceConfig {
  return {
    ...config,
    modules: config.modules.map((m) =>
      m.id === moduleId ? { ...m, [flag]: !m[flag] } : m,
    ),
  };
}

export function toggleCategoryFlag(
  config: WorkspaceConfig,
  categoryId: string,
  flag: 'visible' | 'collapsed',
): WorkspaceConfig {
  return {
    ...config,
    categories: config.categories.map((c) =>
      c.id === categoryId ? { ...c, [flag]: !c[flag] } : c,
    ),
  };
}

function swapByOrder<T extends { id: string; order: number }>(
  items: T[],
  itemId: string,
  direction: -1 | 1,
): T[] {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((item) => item.id === itemId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= sorted.length) return items;
  const next = sorted.map((item) => ({ ...item }));
  const current = next[index];
  const neighbor = next[target];
  if (!current || !neighbor) return items;
  const currentOrder = current.order;
  current.order = neighbor.order;
  neighbor.order = currentOrder;
  return next;
}

export function moveModule(
  config: WorkspaceConfig,
  moduleId: string,
  direction: -1 | 1,
): WorkspaceConfig {
  const target = config.modules.find((m) => m.id === moduleId);
  if (!target) return config;
  const peers = config.modules.filter((m) => m.categoryId === target.categoryId);
  const reordered = swapByOrder(peers, moduleId, direction);
  const byId = new Map(reordered.map((m) => [m.id, m]));
  return {
    ...config,
    modules: config.modules.map((m) => byId.get(m.id) ?? m),
  };
}

export function moveCategory(
  config: WorkspaceConfig,
  categoryId: string,
  direction: -1 | 1,
): WorkspaceConfig {
  const byId = new Map(
    swapByOrder(config.categories, categoryId, direction).map((c) => [c.id, c]),
  );
  return {
    ...config,
    categories: config.categories.map((c) => byId.get(c.id) ?? c),
  };
}

/** 回傳「啟用中的採集插件 id」清單（未來 scan-panel 依此註冊 SDK 模組）。 */
export function getEnabledDetectionIds(config: WorkspaceConfig): string[] {
  return config.modules
    .filter((m) => m.kind === 'detection' && m.enabled)
    .sort((a, b) => a.order - b.order)
    .map((m) => m.id);
}
