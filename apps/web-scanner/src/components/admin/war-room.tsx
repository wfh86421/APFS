'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

/**
 * 🛡️ 戰情室（Command Center）— 管理者工作台「中樞」首頁。
 *
 * 以跨學科戰略觀點把後台十個入口分成三個戰區：
 *   📡 態勢感知（Watch）→ 先看清楚發生什麼
 *   🎯 決策與成效（Decide / Act）→ 用資料做決策、看決策是否有效
 *   🧱 治理與延伸（Configure / Evolve）→ 設定、與未來能力
 * 每個入口卡可「整理」上下移動順序（localStorage 記憶）；規劃中項目自動灰化。
 * 舊版「6+1 掃描模組／首頁區塊」工作台已由 /admin/layout 取代，移至 /admin/legacy-workbench。
 */

const ZONES: Array<{
  id: string;
  icon: string;
  name: string;
  desc: string;
  hint: string;
}> = [
  { id: 'watch', icon: '📡', name: '態勢感知 Watch', desc: '先看清楚發生什麼', hint: '報告・事件・設備・概覽' },
  { id: 'decide', icon: '🎯', name: '決策與成效 Decide', desc: '用資料下決策、驗證決策是否有效', hint: 'ROI・基準・決策示範' },
  { id: 'govern', icon: '🧱', name: '治理與延伸 Govern', desc: '設定戰區版面、未來能力', hint: '版面・市場・設定' },
];

interface PageEntry {
  id: string;
  href: string;
  label: string;
  icon: string;
  ready: boolean;
  desc: string;
  zone: string;
}

const PAGES: PageEntry[] = [
  { id: 'reports', href: '/admin/reports', label: '報告列表', icon: '🗂️', ready: true, desc: '查詢每一次掃描報告與決策紀錄', zone: 'watch' },
  { id: 'events', href: '/admin/events', label: '事件查詢', icon: '🚨', ready: true, desc: '風險事件（規則命中）時間軸與篩選', zone: 'watch' },
  { id: 'devices', href: '/admin/devices', label: '設備指紋', icon: '🧬', ready: true, desc: '跨 session 設備聚類：IP 變了指紋不變', zone: 'watch' },
  { id: 'overview', href: '/admin/overview', label: '管理概覽', icon: '📊', ready: true, desc: '整體態勢儀表（KPI 摘要）', zone: 'watch' },
  { id: 'roi', href: '/admin/roi', label: '成效 ROI', icon: '📈', ready: true, desc: '決策成效閉環：攔截 vs 誤殺', zone: 'decide' },
  { id: 'baselines', href: '/admin/baselines', label: '基準分布', icon: '🧮', ready: true, desc: '規則 × 國家／ASN／時區命中基準（資料黃金）', zone: 'decide' },
  { id: 'demo', href: '/admin/reports/demo', label: '報告決策示範', icon: '📋', ready: true, desc: '以示範報告檢視決策流程', zone: 'decide' },
  { id: 'layout', href: '/admin/layout', label: '版面設定', icon: '🧱', ready: true, desc: '自訂區塊：後台各頁啟停／排序／參數', zone: 'govern' },
  { id: 'modules', href: '/admin/modules', label: '模組市場', icon: '🧩', ready: false, desc: '第三方模組安裝（規劃中）', zone: 'govern' },
  { id: 'settings', href: '/admin/settings', label: '設定', icon: '⚙️', ready: false, desc: '租戶／計費／SSO 等（規劃中）', zone: 'govern' },
];

const LS_KEY = 'ss.admin.warroom.v1';

function defaultOrder(): Record<string, string[]> {
  const out: Record<string, string[]> = { watch: [], decide: [], govern: [] };
  for (const zone of ZONES) {
    out[zone.id] = PAGES.filter((p) => p.zone === zone.id).map((p) => p.id);
  }
  return out;
}

function loadOrder(): Record<string, string[]> {
  if (typeof window === 'undefined') return defaultOrder();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const merged = defaultOrder();
      for (const zone of ZONES) {
        const list = parsed[zone.id];
        if (Array.isArray(list)) {
          const valid = list.filter(
            (id): id is string =>
              typeof id === 'string' && PAGES.some((p) => p.id === id && p.zone === zone.id),
          );
          for (const id of merged[zone.id] ?? []) {
            if (!valid.includes(id)) valid.push(id);
          }
          merged[zone.id] = valid;
        }
      }
      return merged;
    }
  } catch {
    /* 解析失敗沿用預設 */
  }
  return defaultOrder();
}

export default function AdminWarRoom() {
  const [order, setOrder] = useState<Record<string, string[]>>(defaultOrder);
  const [ready, setReady] = useState(false);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    setOrder(loadOrder());
    setReady(true);
  }, []);

  const persist = (next: Record<string, string[]>) => {
    setOrder(next);
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* 忽略儲存失敗 */
    }
  };

  const move = (zoneId: string, id: string, dir: -1 | 1) => {
    const list = order[zoneId] ?? [];
    const i = list.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const nextList = [...list];
    const a = nextList[i] as string;
    const b = nextList[j] as string;
    nextList[i] = b;
    nextList[j] = a;
    persist({ ...order, [zoneId]: nextList });
  };

  const total = PAGES.length;
  const readyCount = PAGES.filter((p) => p.ready).length;
  const byId = useMemo(() => new Map(PAGES.map((p) => [p.id, p])), []);

  const zones = ZONES.map((zone) => ({
    zone,
    entries: (order[zone.id] ?? [])
      .map((id) => byId.get(id))
      .filter((p): p is PageEntry => Boolean(p)),
  }));

  return (
    <div className="wr">
      <style>{`
        .wr{display:flex;flex-direction:column;gap:18px}
        .wr-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .wr-title{font-size:22px;margin:0;letter-spacing:.5px}
        .wr-title small{display:block;font-size:13px;color:#8fa2ba;font-weight:400;margin-top:4px}
        .wr-actions{display:flex;gap:8px}
        .wr-btn{background:#15233c;border:1px solid #22344f;color:#e8eef7;border-radius:8px;padding:6px 12px;cursor:pointer}
        .wr-btn.primary{background:#4da3ff;color:#06121f;font-weight:700;border:none}
        .wr-chips{display:flex;gap:10px;flex-wrap:wrap}
        .wr-chip{font-size:12px;color:#cfe3ff;background:#15233c;border:1px solid #22344f;border-radius:999px;padding:4px 10px}
        .wr-zone{display:flex;flex-direction:column;gap:10px}
        .wr-zone-head{display:flex;align-items:baseline;gap:8px}
        .wr-zone-name{font-size:15px;font-weight:700}
        .wr-zone-desc{font-size:12px;color:#8fa2ba}
        .wr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
        .wr-card{position:relative;display:flex;flex-direction:column;gap:6px;background:#101b2e;border:1px solid #22344f;border-radius:12px;padding:12px 14px;text-decoration:none;color:#e8eef7;transition:border-color .15s}
        a.wr-card:hover{border-color:#4da3ff}
        .wr-card.soon{opacity:.55;cursor:not-allowed;pointer-events:none}
        .wr-card-top{display:flex;align-items:center;gap:8px}
        .wr-card-icon{font-size:22px}
        .wr-card-label{font-weight:700;font-size:14px}
        .soon-tag-wr{margin-left:auto;font-size:11px;color:#0b0f18;background:#f0b429;border-radius:999px;padding:2px 8px}
        .wr-card-desc{font-size:12px;color:#8fa2ba;line-height:1.5}
        .wr-card-ctrls{display:none;gap:6px;margin-top:2px}
        .wr.edit .wr-card-ctrls{display:flex}
        .wr-mini{background:#15233c;border:1px solid #3a5377;color:#cfe3ff;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:12px}
        .wr-legacy{margin-top:6px;font-size:12px;color:#8fa2ba;background:#15233c;border:1px dashed #3a5377;border-radius:10px;padding:10px 12px}
        .wr-legacy a{color:#4da3ff}
      `}</style>

      <header className="wr-head">
        <div>
          <h1 className="wr-title">
            🛡️ 戰情室 Command Center
            <small>
              中樞神經：偵測態勢 → 決策 → 成效閉環 → 治理。點卡片進入該作戰單元；「整理」可自訂各戰區順序（記憶於本機）。
            </small>
          </h1>
        </div>
        <div className="wr-actions">
          <button className={`wr-btn${editMode ? ' primary' : ''}`} onClick={() => setEditMode((v) => !v)}>
            {editMode ? '完成整理' : '✏️ 整理'}
          </button>
          <button
            className="wr-btn"
            onClick={() => {
              if (window.confirm('還原戰情室為預設順序？')) persist(defaultOrder());
            }}
          >
            還原
          </button>
        </div>
      </header>

      {ready && (
        <div className="wr-chips">
          <span className="wr-chip">作戰單元 {total}</span>
          <span className="wr-chip">已上線 {readyCount}</span>
          <span className="wr-chip">規劃中 {total - readyCount}</span>
          <span className="wr-chip">舊版 6+1／首頁工作台 → <Link href="/admin/legacy-workbench">進階工作台</Link></span>
        </div>
      )}

      <div className={`wr${editMode ? ' edit' : ''}`}>
        {zones.map(({ zone, entries }) => (
          <section className="wr-zone" key={zone.id}>
            <div className="wr-zone-head">
              <span className="wr-zone-icon">{zone.icon}</span>
              <span className="wr-zone-name">{zone.name}</span>
              <span className="wr-zone-desc">— {zone.desc}（{zone.hint}）</span>
            </div>
            <div className="wr-grid">
              {entries.map((entry) => {
                const inner = (
                  <>
                    <span className="wr-card-top">
                      <span className="wr-card-icon">{entry.icon}</span>
                      <span className="wr-card-label">{entry.label}</span>
                      {!entry.ready && <span className="soon-tag-wr">規劃中</span>}
                    </span>
                    <span className="wr-card-desc">{entry.desc}</span>
                    {editMode && (
                      <span className="wr-card-ctrls">
                        <button
                          className="wr-mini"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            move(zone.id, entry.id, -1);
                          }}
                          title="上移"
                        >
                          ↑
                        </button>
                        <button
                          className="wr-mini"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            move(zone.id, entry.id, 1);
                          }}
                          title="下移"
                        >
                          ↓
                        </button>
                      </span>
                    )}
                  </>
                );
                return entry.ready ? (
                  <Link key={entry.id} href={entry.href} className="wr-card">
                    {inner}
                  </Link>
                ) : (
                  <div key={entry.id} className="wr-card soon" title="規劃中，尚無法使用">
                    {inner}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="wr-legacy">
        備註：「後台模組（6＋1）／首頁區塊」舊版工作台已由 <Link href="/admin/layout">版面設定（自訂區塊）</Link>
        取代；若仍需調整掃描採集模組本身（啟用／停用），請到{' '}
        <Link href="/admin/legacy-workbench">進階工作台</Link>。
      </div>
    </div>
  );
}
