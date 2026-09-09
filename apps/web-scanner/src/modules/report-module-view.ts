/**
 * 報告檢視模組（6＋1）的「單一事實來源」讀取器。
 *
 * 版面設定（/admin/layout）中的「報告檢視模組設定」頁（layout page `workbench`）
 * 控制報告詳情各區塊的顯示與排序；本函式供：
 *   - /admin/reports/demo（報告決策示範）
 *   - /admin/reports/[reportId]（真實報告頁）
 * 共用。讀取順序：版面設定本機快取 → 舊 workspace 設定（相容 fallback）→ 全預設。
 * layout key（workbench.*）↔ 舊 module id（decision.*）為固定對照，見 PAIRS。
 */
import { loadWorkspaceConfig } from './store';

export interface ReportViewState {
  /** 資料來源（除錯用） */
  mode: 'layout' | 'legacy' | 'default';
  /** 依版面順序排列的 module id（不含停用/隱藏）。 */
  order: string[];
  /** 應顯示的 module id 集合。 */
  shown: Set<string>;
}

const PAIRS: Array<{ layoutKey: string; moduleId: string }> = [
  { layoutKey: 'workbench.decision', moduleId: 'decision.verdict' },
  { layoutKey: 'workbench.risk', moduleId: 'risk.conflicts' },
  { layoutKey: 'workbench.network', moduleId: 'network.geo' },
  { layoutKey: 'workbench.hardware', moduleId: 'hardware.fp' },
  { layoutKey: 'workbench.browser', moduleId: 'browser.env' },
  { layoutKey: 'workbench.raw', moduleId: 'raw.payload' },
  { layoutKey: 'workbench.governance', moduleId: 'governance.audit' },
];

const DEFAULT_ORDER = PAIRS.map((p) => p.moduleId);

function localLayoutOrder(): { order: string[]; disabled: string[] } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('ss.layout.v1.workbench');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { order?: unknown; disabled?: unknown };
    const valid = (list: unknown): string[] =>
      Array.isArray(list)
        ? list.filter(
            (item): item is string =>
              typeof item === 'string' && PAIRS.some((p) => p.layoutKey === item),
          )
        : [];
    const order = valid(parsed.order);
    const disabled = valid(parsed.disabled);
    return { order, disabled };
  } catch {
    return null;
  }
}

export function reportViewState(): ReportViewState {
  const layout = localLayoutOrder();
  if (layout) {
    const enabledLayoutKeys =
      layout.order.length > 0 ? layout.order : PAIRS.map((p) => p.layoutKey);
    const order = enabledLayoutKeys
      .filter((k) => !layout.disabled.includes(k))
      .map((k) => PAIRS.find((p) => p.layoutKey === k)?.moduleId)
      .filter((id): id is string => typeof id === 'string');
    return { mode: 'layout', order, shown: new Set(order) };
  }

  const legacy = loadWorkspaceConfig();
  const order = legacy.modules
    .filter((m) => m.enabled && m.visible)
    .map((m) => m.id)
    .filter((id) => PAIRS.some((p) => p.moduleId === id));
  if (order.length > 0) {
    return { mode: 'legacy', order, shown: new Set(order) };
  }

  return { mode: 'default', order: DEFAULT_ORDER, shown: new Set(DEFAULT_ORDER) };
}
