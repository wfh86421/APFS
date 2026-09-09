'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  ADMIN_PAGES,
  ADMIN_PAGE_KEYS,
  defaultSettingsFor,
  listPageBlocks,
  validateBlockSettings,
  type AdminPageKey,
  type BlockDef,
  type BlockFieldDef,
} from '@shieldscan/core-schema';
import { apiBaseUrl } from '../../lib/api';
import WorkbenchPreview, { moduleDictFor } from './workbench-live';
import HomepageConfig from './homepage-config';

/**
 * Phase A UI 雛形（TRIAL 評判用）：版面設定
 *
 * - 依 core-schema Block Registry（M1）自動產生每頁區塊清單與設定表單；
 * - 目前以 localStorage 持久化（試用版）；M2/M3 將改為 dashboard_blocks 表＋API；
 * - 設定僅存純資料欄位（text/number/select/multiselect/toggle/color）。
 */

type SettingsMap = Record<string, Record<string, unknown>>;
interface PageLayout {
  order: string[];
  disabled: string[];
  settings: SettingsMap;
}

function defaultsFor(page: AdminPageKey): PageLayout {
  const defs = listPageBlocks(page);
  return {
    order: defs.map((d) => d.key),
    disabled: defs.filter((d) => !d.defaultEnabled).map((d) => d.key),
    settings: Object.fromEntries(defs.map((d) => [d.key, defaultSettingsFor(d)])),
  };
}

function storageKey(page: AdminPageKey): string {
  return `ss.layout.v1.${page}`;
}

function loadLayout(page: AdminPageKey): PageLayout {
  const base = defaultsFor(page);
  if (typeof window === 'undefined') return base;
  try {
    const raw = window.localStorage.getItem(storageKey(page));
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<PageLayout>;
    // 儲存順序優先（支援排序並在 reload 後保持），並剔除已下架區塊、
    // 把新註冊的區塊依預設位置補在未列出的尾端。
    const storedOrder = parsed.order;
    const order = Array.isArray(storedOrder)
      ? [
          ...storedOrder.filter((k) => base.order.includes(k)),
          ...base.order.filter((k) => !storedOrder.includes(k)),
        ]
      : base.order;
    const disabled = Array.isArray(parsed.disabled) ? parsed.disabled : base.disabled;
    const settings: SettingsMap = { ...base.settings };
    if (parsed.settings && typeof parsed.settings === 'object') {
      for (const [key, value] of Object.entries(parsed.settings)) {
        if (base.settings[key] && value && typeof value === 'object') {
          settings[key] = { ...base.settings[key], ...value };
        }
      }
    }
    return { order, disabled, settings };
  } catch {
    return base;
  }
}

function saveLayout(page: AdminPageKey, layout: PageLayout): void {
  try {
    window.localStorage.setItem(storageKey(page), JSON.stringify(layout));
  } catch {
    /* ignore quota */
  }
}

/* ---------------- 後端同步（M3 API；401/離線時自動降級 localStorage） ---------------- */

interface ServerBlock {
  blockKey: string;
  enabled: boolean;
  position: number;
  settings: Record<string, unknown>;
}
interface ServerPage {
  key: AdminPageKey;
  blocks: ServerBlock[];
}

function apiKeyFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('shieldscan.admin.apiKey');
}

function layoutFromServer(blocks: ServerBlock[]): PageLayout {
  const sorted = [...blocks].sort((a, b) => a.position - b.position);
  return {
    order: sorted.map((b) => b.blockKey),
    disabled: sorted.filter((b) => !b.enabled).map((b) => b.blockKey),
    settings: Object.fromEntries(sorted.map((b) => [b.blockKey, b.settings])),
  };
}

async function fetchServerPages(): Promise<ServerPage[] | null> {
  const key = apiKeyFromStorage();
  if (!key) return null;
  try {
    const res = await fetch(`${apiBaseUrl()}/v1/dashboard/blocks`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { pages: ServerPage[] };
    return body.pages;
  } catch {
    return null;
  }
}

async function pushBlockToServer(
  page: AdminPageKey,
  layout: PageLayout,
  blockKey: string,
): Promise<boolean> {
  const key = apiKeyFromStorage();
  if (!key) return false;
  const position = Math.max(0, layout.order.indexOf(blockKey));
  try {
    const res = await fetch(`${apiBaseUrl()}/v1/dashboard/blocks/${encodeURIComponent(blockKey)}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        enabled: !layout.disabled.includes(blockKey),
        position,
        settings: layout.settings[blockKey] ?? {},
      }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function resetBlockOnServer(blockKey: string): Promise<boolean> {
  const key = apiKeyFromStorage();
  if (!key) return false;
  try {
    const res = await fetch(
      `${apiBaseUrl()}/v1/dashboard/blocks/${encodeURIComponent(blockKey)}/reset`,
      { method: 'POST', headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) },
    );
    return res.ok;
  } catch {
    return false;
  }
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: BlockFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (field.kind) {
    case 'text':
      return (
        <input
          type="text"
          maxLength={field.max}
          defaultValue={typeof value === 'string' ? value : field.default}
          onBlur={(e) => onChange(e.target.value)}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          min={field.min}
          max={field.max}
          defaultValue={typeof value === 'number' ? value : field.default}
          onBlur={(e) => onChange(Number(e.target.value))}
        />
      );
    case 'select':
      return (
        <select
          defaultValue={typeof value === 'string' ? value : field.default}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case 'multiselect': {
      const current = Array.isArray(value) ? value : field.default;
      return (
        <div className="pab-ms">
          {field.options.map((opt) => (
            <label key={opt} className="pab-ms-item">
              <input
                type="checkbox"
                checked={current.includes(opt)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...current, opt].slice(0, field.maxItems)
                    : current.filter((x) => x !== opt);
                  onChange(next);
                }}
              />
              {opt}
            </label>
          ))}
        </div>
      );
    }
    case 'toggle':
      return (
        <label className="pab-toggle">
          <input
            type="checkbox"
            checked={value === true || (value === undefined && field.default === true)}
            onChange={(e) => onChange(e.target.checked)}
          />
          {field.description ?? field.label}
        </label>
      );
    case 'color':
      return (
        <input
          type="color"
          defaultValue={typeof value === 'string' ? value : field.default}
          onBlur={(e) => onChange(e.target.value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

function BlockSettingsDrawer({
  block,
  layout,
  onSave,
  onClose,
}: {
  block: BlockDef;
  layout: PageLayout;
  onSave: (settings: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const draft = useMemo(() => ({ ...(layout.settings[block.key] ?? {}) }), [block, layout]);
  const [issues, setIssues] = useState<string[]>([]);

  const apply = () => {
    const result = validateBlockSettings(block.key, draft);
    if (!result.ok) {
      setIssues(result.issues.map((i) => `${i.field}: ${i.message}`));
      return;
    }
    setIssues([]);
    onSave(result.data);
    onClose();
  };

  return (
    <div className="pab-drawer">
      <div className="pab-drawer-head">
        <b>
          {block.icon} 設定 — {block.title}
        </b>
        <button onClick={onClose} aria-label="關閉">✕</button>
      </div>
      <p className="pab-drawer-note">
        欄位由區塊定義自動產生（僅純資料，不存 HTML/程式碼）；儲存即寫入後端 dashboard_blocks
        （security_admin 限定）並記入審計。
      </p>
      {moduleDictFor(block.key) && (
        <details className="pab-dict">
          <summary>
            資料欄位＋API（{moduleDictFor(block.key)!.fields.length}）
          </summary>
          <p className="pab-dict-api">API：{moduleDictFor(block.key)!.api}</p>
          <ul>
            {moduleDictFor(block.key)!.fields.map((f) => (
              <li key={f.fieldPath}>
                <code>{f.fieldPath}</code> — {f.label}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="pab-fields">
        {block.fields.map((field) => (
          <div className="pab-field" key={field.key}>
            <label>{field.label}</label>
            <FieldInput
              field={field}
              value={draft[field.key]}
              onChange={(v) => {
                draft[field.key] = v;
              }}
            />
            {field.description ? <small>{field.description}</small> : null}
          </div>
        ))}
      </div>
      {issues.length > 0 && (
        <ul className="pab-errors">
          {issues.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      <div className="pab-drawer-actions">
        <button onClick={onClose}>取消</button>
        <button className="pab-primary" onClick={apply}>儲存並套用</button>
      </div>
    </div>
  );
}

export default function BlockLayoutEditor() {
  const [page, setPage] = useState<AdminPageKey>('overview');
  const [layout, setLayout] = useState<PageLayout>(() => loadLayout('overview'));
  const [editing, setEditing] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [toast, setToast] = useState('');
  const [mode, setMode] = useState<'local' | 'server'>('local');
  const [banner, setBanner] = useState('');
  const [serverPages, setServerPages] = useState<Map<AdminPageKey, PageLayout>>(new Map());

  // 啟動：有 API Key 時優先讀後端（M3）；否則以本機 localStorage 示範。
  useEffect(() => {
    let alive = true;
    (async () => {
      const pages = await fetchServerPages();
      if (!alive) return;
      if (pages && pages.length > 0) {
        const map = new Map<AdminPageKey, PageLayout>();
        for (const p of pages) {
          map.set(p.key, layoutFromServer(p.blocks));
        }
        setServerPages(map);
        setMode('server');
        setBanner('已連線後端：版面以正式 API 儲存（tenant 隔離）');
        const current = map.get('overview');
        if (current) {
          setLayout(current);
          saveLayout('overview', current);
        }
      } else {
        setMode('local');
        setBanner('未偵測到 API Key：以本機示範儲存（localStorage）；到 /register 註冊後即可用後端正式儲存');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const defs = useMemo(() => listPageBlocks(page), [page]);
  const byKey = useMemo(() => new Map(defs.map((d) => [d.key, d])), [defs]);

  // 每塊有效標題（設定覆寫或預設），供預覽與工作台卡使用。
  const titles = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of defs) {
      const settings = layout.settings[d.key];
      const titleField = d.fields.find((f) => f.kind === 'text' && f.key === 'title') as
        | { default: string }
        | undefined;
      map[d.key] =
        settings && typeof settings.title === 'string'
          ? settings.title
          : (titleField?.default ?? d.title);
    }
    return map;
  }, [defs, layout.settings]);

  const commit = async (next: PageLayout) => {
    setLayout(next);
    const current = mode;
    if (current === 'server') {
      const results = await Promise.all(
        defs.map((d) => pushBlockToServer(page, next, d.key)),
      );
      if (results.every(Boolean)) {
        setToast('已儲存到後端（dashboard_blocks）');
        const map = new Map(serverPages);
        map.set(page, next);
        setServerPages(map);
        saveLayout(page, next);
      } else {
        setToast('後端儲存失敗（可能 key 已失效），仍保留在本機');
        setMode('local');
      }
      window.setTimeout(() => setToast(''), 2500);
      return;
    }
    saveLayout(page, next);
    setToast('已儲存到本機（localStorage 示範版）');
    window.setTimeout(() => setToast(''), 2500);
  };

  const switchPage = (p: AdminPageKey) => {
    setPage(p);
    setEditing(null);
    setPreview(false);
    const server = serverPages.get(p);
    if (mode === 'server' && server) {
      setLayout(server);
    } else {
      setLayout(loadLayout(p));
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    const order = [...layout.order];
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    const current = order[index];
    const next = order[target];
    if (current === undefined || next === undefined) return;
    order[index] = next;
    order[target] = current;
    void commit({ ...layout, order });
  };

  const toggleDisabled = (key: string) => {
    const disabled = layout.disabled.includes(key)
      ? layout.disabled.filter((k) => k !== key)
      : [...layout.disabled, key];
    void commit({ ...layout, disabled });
  };

  const resetPage = async () => {
    if (!window.confirm(`還原「${ADMIN_PAGES[page].title}」頁的版面為預設？`)) return;
    const def = defaultsFor(page);
    if (mode === 'server') {
      const persisted = [...def.order];
      await Promise.all(persisted.map((key) => resetBlockOnServer(key)));
      const map = new Map(serverPages);
      map.set(page, def);
      setServerPages(map);
      setToast('已還原為預設並同步後端');
    } else {
      setToast('已還原為預設（本機）');
    }
    setLayout(def);
    saveLayout(page, def);
    window.setTimeout(() => setToast(''), 2000);
  };

  const ordered = layout.order
    .map((key) => byKey.get(key))
    .filter((d): d is BlockDef => Boolean(d));

  return (
    <div className="pab">
      <style>{`
        .pab{display:flex;flex-direction:column;gap:14px;padding:18px;background:#0f1826;border:1px solid #22344f;border-radius:14px;color:#e8eef7;font-family:inherit}
        .pab h2{margin:0 0 4px;font-size:17px}
        .pab .pab-sub{color:#8fa2ba;font-size:12.5px;margin:0 0 10px;line-height:1.6}
        .pab .pab-banner{background:#10233c;border:1px solid #2f5d8f;border-radius:9px;color:#bcd3ec;font-size:12px;padding:7px 11px;margin:0 0 10px}
        .pab .pab-hp{border:1px solid #2f5d8f;border-radius:12px;padding:12px 14px;background:#0f1a2c;display:flex;flex-direction:column;gap:10px}
        .pab .pab-hp-head b{font-size:13.5px;color:#8fc2ff}
        .pab .pab-hp-head span{display:block;color:#8fa2ba;font-size:12px;line-height:1.7;margin-top:2px}
        .pab .pab-hp summary{cursor:pointer;color:#bcd3ec;font-size:12.5px}
        .pab .pab-hp-body{margin-top:8px}
        .pab .pab-pages{display:flex;gap:6px;flex-wrap:wrap}
        .pab .pab-pages button{background:#15233c;border:1px solid #22344f;color:#bcd3ec;border-radius:999px;padding:5px 12px;font-size:12.5px;cursor:pointer}
        .pab .pab-pages button.on{background:#1c3a63;border-color:#4da3ff;color:#fff}
        .pab .pab-bar{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}
        .pab .pab-bar button{background:#15233c;border:1px solid #22344f;color:#e8eef7;border-radius:9px;padding:6px 12px;font-size:12.5px;cursor:pointer}
        .pab .pab-blocks{display:flex;flex-direction:column;gap:8px}
        .pab .pab-block{display:flex;align-items:center;gap:10px;background:#101a2a;border:1px solid #22344f;border-radius:10px;padding:9px 12px}
        .pab .pab-block.off{opacity:.5}
        .pab .pab-block .grow{flex:1}
        .pab .pab-block b{font-size:13px}
        .pab .pab-block small{display:block;color:#8fa2ba;font-size:11.5px}
        .pab .ctrl{background:#15233c;border:1px solid #2c3a52;color:#cfe3ff;border-radius:7px;padding:3px 8px;font-size:12px;cursor:pointer}
        .pab .ctrl.on{background:#173458;border-color:#4da3ff}
        .pab .pill{font-size:10.5px;border-radius:999px;padding:1px 8px;border:1px solid #2c3a52;color:#8fa2ba}
        .pab .pill.g{color:#34d399;border-color:#1d6a50}
        .pab .pill.r{color:#f87171;border-color:#7a1f2e}
        .pab .pill.api{color:#8fc2ff;border-color:#2c5f9e;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .pab-dict{border:1px solid #22344f;border-radius:9px;padding:7px 11px;font-size:11.5px;background:#0f1826}
        .pab-dict summary{cursor:pointer;color:#8fc2ff}
        .pab-dict-api{color:#8fa2ba;margin:6px 0 4px;font-size:11px}
        .pab-dict ul{margin:0;padding-left:16px;color:#bcd3ec;display:flex;flex-direction:column;gap:2px}
        .pab-dict code{color:#cfe3ff}
        .pab .pab-preview{border:1px dashed #2f5d8f;background:#0d1626;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px}
        .pab .pab-preview h3{margin:0;font-size:13px;color:#8fc2ff}
        .pab .pv-card{background:#15233c;border:1px solid #22344f;border-radius:9px;padding:10px 12px;font-size:13px}
        .pab .pv-empty{color:#47618a;font-size:12px}
        .pab-drawer{border:1px solid #4da3ff;background:#15233c;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:10px}
        .pab-inline-drawer{margin:0 0 12px}
        .pab-drawer-head{display:flex;justify-content:space-between;align-items:center}
        .pab-drawer-head button{background:none;border:none;color:#cfe3ff;cursor:pointer;font-size:14px}
        .pab-drawer-note{color:#8fa2ba;font-size:12px;margin:0;line-height:1.6}
        .pab-fields{display:flex;flex-direction:column;gap:10px}
        .pab-field{display:flex;flex-direction:column;gap:4px}
        .pab-field label{font-size:12.5px;color:#cfe3ff}
        .pab-field small{color:#8fa2ba;font-size:11px}
        .pab-field input[type=text],.pab-field input[type=number],.pab-field select{background:#0f1826;border:1px solid #2c3a52;border-radius:8px;padding:7px 9px;color:#e8eef7;font-size:13px}
        .pab-field input[type=color]{width:60px;height:30px;border:1px solid #2c3a52;border-radius:6px;background:#0f1826}
        .pab-ms{display:flex;flex-wrap:wrap;gap:6px}
        .pab-ms-item{display:flex;gap:5px;align-items:center;background:#0f1826;border:1px solid #2c3a52;border-radius:999px;padding:3px 10px;font-size:12px}
        .pab-toggle{display:flex;gap:8px;align-items:center;font-size:12.5px}
        .pab-errors{color:#f87171;font-size:12px;margin:0;padding-left:18px}
        .pab-drawer-actions{display:flex;gap:8px;justify-content:flex-end}
        .pab-drawer-actions button{background:#15233c;border:1px solid #22344f;color:#e8eef7;border-radius:8px;padding:6px 12px;cursor:pointer}
        .pab-drawer-actions .pab-primary{background:#4da3ff;color:#06121f;border:none;font-weight:700}
        .pab-toast{color:#34d399;font-size:12px}
      `}</style>

      <div>
        <h2>🧱 版面設定（自訂區塊）</h2>
        <p className="pab-sub">
          Phase A：每頁由區塊組成，可啟停 / 排序（⬆⬇）/ 編輯參數（⚙）。已接後端 dashboard_blocks
          （tenant 隔離＋security_admin＋審計）；未登入時自動以本機 localStorage 示範。
        </p>
        {banner && <div className="pab-banner">{banner}</div>}
      </div>

      <div className="pab-pages">
        {ADMIN_PAGE_KEYS.map((p) => (
          <button
            key={p}
            className={p === page ? 'on' : ''}
            onClick={() => switchPage(p)}
          >
            {ADMIN_PAGES[p].icon ?? ''} {ADMIN_PAGES[p].title}
          </button>
        ))}
      </div>

      <div className="pab-bar">
        <b style={{ fontSize: 13.5 }}>
          {ADMIN_PAGES[page].title}（{ordered.length} 區塊）
        </b>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setPreview((v) => !v)}>
            {preview ? '回到編輯' : '👁 檢視自訂結果'}
          </button>
          <button onClick={resetPage}>↺ 還原此頁預設</button>
        </div>
      </div>

      {preview ? (
        page === 'workbench' ? (
          <WorkbenchPreview layout={layout} blockTitles={titles} />
        ) : (
          <div className="pab-preview">
            <h3>{ADMIN_PAGES[page].title} — 自訂檢視（預覽）</h3>
            {ordered.filter((d) => !layout.disabled.includes(d.key)).length === 0 && (
              <div className="pv-empty">此頁所有區塊都已停用。</div>
            )}
            {ordered
              .filter((d) => !layout.disabled.includes(d.key))
              .map((d) => (
                <div className="pv-card" key={d.key}>
                  <b>
                    {d.icon} {titles[d.key]}
                  </b>
                  <small style={{ color: '#8fa2ba' }}>
                    （此區塊已啟用；資料接線依頁別進行中）
                  </small>
                </div>
              ))}
          </div>
        )
      ) : (
        <div className="pab-blocks">
          {ordered.map((d, index) => {
            const off = layout.disabled.includes(d.key);
            return (
              <Fragment key={d.key}>
                <div className={`pab-block${off ? ' off' : ''}`}>
                  <span style={{ fontSize: 16 }}>{d.icon}</span>
                  <div className="grow">
                    <b>{d.title}</b>
                    <small>{d.description}</small>
                  </div>
                  <span className={`pill ${off ? 'r' : 'g'}`}>{off ? '已停用' : '啟用'}</span>
                  {moduleDictFor(d.key) && (
                    <span className="pill api" title={moduleDictFor(d.key)?.api}>
                      API {moduleDictFor(d.key)?.api}
                    </span>
                  )}
                  <button className="ctrl" onClick={() => move(index, -1)} title="上移">⬆</button>
                  <button className="ctrl" onClick={() => move(index, 1)} title="下移">⬇</button>
                  <button className="ctrl on" onClick={() => setEditing(d.key)} title="設定">⚙</button>
                  <button className="ctrl" onClick={() => toggleDisabled(d.key)} title={off ? '啟用' : '停用'}>⛔</button>
                </div>
                {editing === d.key && byKey.get(d.key) && (
                  <div className="pab-inline-drawer">
                    <BlockSettingsDrawer
                      block={byKey.get(d.key)!}
                      layout={layout}
                      onSave={(settings) =>
                        commit({ ...layout, settings: { ...layout.settings, [d.key]: settings } })
                      }
                      onClose={() => setEditing(null)}
                    />
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      )}

      {page === 'homepage' && (
        <section className="pab-hp">
          <div className="pab-hp-head">
            <b>🌐 公開首頁區塊（整合自管理者工作台）</b>
            <span>真實首頁結構：頂部連結・同意橫幅・一鍵掃描・結果各段（分數/異常/硬體/瀏覽器/網路/CTA）・頁尾 — 啟停與排序即時影響公開首頁 `/`，存 site_configs（全域）。</span>
          </div>
          <details open>
            <summary>展開／收合：管理公開首頁 10 區塊</summary>
            <div className="pab-hp-body">
              <HomepageConfig embedded />
            </div>
          </details>
        </section>
      )}

      {editing && !ordered.some((d) => d.key === editing) && byKey.get(editing) && (
        <BlockSettingsDrawer
          block={byKey.get(editing)!}
          layout={layout}
          onSave={(settings) =>
            commit({ ...layout, settings: { ...layout.settings, [editing]: settings } })
          }
          onClose={() => setEditing(null)}
        />
      )}

      {toast && <div className="pab-toast">{toast}</div>}
    </div>
  );
}
