'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { listPageBlocks } from '@shieldscan/core-schema';
import { apiBaseUrl } from '../../lib/api';

/**
 * 工作台（6+1）即時預覽：以真實 API 資料渲染每張分類卡。
 * 資料來源：reports(recent/detail) / risk-events / review-cases / audit-logs。
 */
interface ServerReportMeta {
  reportId: string;
  riskLevel?: string;
  finalScore?: number;
  grade?: string;
}

type Snapshot = {
  loading: boolean;
  authed: boolean;
  reports: ServerReportMeta[];
  detail: Record<string, unknown> | null;
  events: Array<Record<string, unknown>>;
  reviews: Array<Record<string, unknown>>;
  audits: Array<Record<string, unknown>>;
};

async function getJson(path: string, key: string): Promise<unknown> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

function fmtTime(v: unknown): string {
  if (typeof v !== 'string') return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const mins = Math.round((now - d.getTime()) / 60000);
  if (mins < 60) return `${mins} 分前`;
  if (mins < 1440) return `${Math.round(mins / 60)} 小時前`;
  return d.toISOString().slice(0, 10);
}

const EV_TYPES: Record<string, string> = {
  open_ports: '開放埠',
  os_mismatch: 'OS 衝突',
  dns_leak: 'DNS 洩漏',
  webrtc_leak: 'WebRTC 洩漏',
  canvas_tampered: 'Canvas 變造',
  bot_detected: '自動化',
  geolocation_jump: '地理跳變',
};

export default function WorkbenchPreview({
  layout,
  blockTitles,
}: {
  layout: { order: string[]; disabled: string[]; settings: Record<string, Record<string, unknown>> };
  blockTitles: Record<string, string>;
}) {
  const defs = useMemo(() => listPageBlocks('workbench'), []);
  const byKey = useMemo(() => new Map(defs.map((d) => [d.key, d])), [defs]);
  const [snap, setSnap] = useState<Snapshot>({
    loading: true,
    authed: false,
    reports: [],
    detail: null,
    events: [],
    reviews: [],
    audits: [],
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      const key =
        typeof window !== 'undefined' ? window.localStorage.getItem('shieldscan.admin.apiKey') ?? '' : '';
      if (!key) {
        if (alive) setSnap({ loading: false, authed: false, reports: [], detail: null, events: [], reviews: [], audits: [] });
        return;
      }
      try {
        const reports = ((await getJson('/v1/reports?limit=1', key)) as { reports: ServerReportMeta[] }).reports;
        let detail: Record<string, unknown> | null = null;
        const firstReport = reports[0];
        if (firstReport) {
          detail = (await getJson(`/v1/reports/${encodeURIComponent(firstReport.reportId)}`, key)) as Record<string, unknown>;
        }
        const events = ((await getJson('/v1/risk-events?limit=6', key)) as { events: Array<Record<string, unknown>> }).events;
        const reviews = ((await getJson('/v1/review-cases?limit=6', key)) as { cases: Array<Record<string, unknown>> }).cases;
        const audits = ((await getJson('/v1/audit-logs?limit=6', key)) as { logs: Array<Record<string, unknown>> }).logs;
        if (alive) setSnap({ loading: false, authed: true, reports, detail, events, reviews, audits });
      } catch {
        if (alive) setSnap({ loading: false, authed: true, reports: [], detail: null, events: [], reviews: [], audits: [] });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const ordered = layout.order.map((k) => byKey.get(k)).filter((d) => d && !layout.disabled.includes(d.key));

  const score = (snap.detail?.scores as Record<string, unknown> | undefined) ?? {};
  const signals = Array.isArray(snap.detail?.signals) ? (snap.detail.signals as Array<{ key?: string; category?: string; hash?: string }>) : [];
  const issues = Array.isArray(snap.detail?.issues) ? (snap.detail.issues as Array<{ id?: string; severity?: string; reason?: string }>) : [];
  const rawNetwork = (snap.detail as Record<string, unknown> | null)?.raw as
    | { network?: { ip?: string; vpn?: boolean; proxy?: boolean; tor?: boolean; riskLevel?: string; webrtc?: { consistency?: string } } }
    | undefined;
  const net = rawNetwork?.network;
  const report = snap.reports[0];

  const hashKeys = ['canvas', 'webgl', 'webgpu', 'audio', 'fonts']
    .map((k) => (signals.find((s) => s.key === k)?.hash ? k : null))
    .filter(Boolean);
  const envKeys = signals
    .filter((s) => ['ua', 'screen', 'locale', 'timezone', 'client_hints'].includes(s.key ?? ''))
    .map((s) => s.key);

  const cards: Array<{ key: string; icon: string; title: string; link: string; body: ReactNode }> = [];
  for (const def of ordered ?? []) {
    if (!def) continue;
    const settings = layout.settings[def.key] ?? {};
    const limit = typeof settings.limit === 'number' ? settings.limit : 4;
    const showSummary = settings.showSummary !== false;
    const title = (blockTitles[def.key] ?? (typeof settings.title === 'string' ? settings.title : def.title)) || def.title;
    let link = '/admin';
    let body: React.ReactNode = null;

    if (!snap.authed) {
      body = <em className="wb-empty">未登入：請先到 /register 取得 API Key。</em>;
    } else if (def.key === 'workbench.decision') {
      link = report ? `/admin/reports/${encodeURIComponent(report.reportId)}` : '/admin/reports/demo';
      if (!showSummary) body = null;
      else if (report) {
        body = (
          <ul className="wb-list">
            <li>
              <b>最近報告</b>：risk={report.riskLevel ?? '—'} / grade={report.grade ?? '—'} / score={report.finalScore ?? '—'}
            </li>
            {snap.reviews.slice(0, limit).map((r, i) => (
              <li key={i}>
                複核：{String(r.status ?? '')}（{String(r.priority ?? '')}）
              </li>
            ))}
          </ul>
        );
      } else body = <em className="wb-empty">尚無報告：先到首頁掃描一份。</em>;
    } else if (def.key === 'workbench.risk') {
      link = '/admin/events';
      if (!showSummary) body = null;
      else if (snap.events.length > 0)
        body = (
          <ul className="wb-list">
            {snap.events.slice(0, limit).map((e, i) => (
              <li key={i}>
                <span className={`sev ${String(e.severity ?? '')}`}>{String(e.severity ?? '')}</span>
                {EV_TYPES[String(e.eventType ?? '')] ?? String(e.eventType ?? '')} · {fmtTime(e.detectedAt)}
              </li>
            ))}
          </ul>
        );
      else body = <em className="wb-empty">尚無風險事件。</em>;
    } else if (def.key === 'workbench.network') {
      link = report ? `/admin/reports/${encodeURIComponent(report.reportId)}` : '/admin/reports/demo';
      if (!showSummary) body = null;
      else if (net)
        body = (
          <ul className="wb-list">
            <li>IP {net.ip ?? '—'} · 風險 {net.riskLevel ?? '—'}</li>
            <li>
              VPN {net.vpn ? '是' : '否'} / Proxy {net.proxy ? '是' : '否'} / Tor {net.tor ? '是' : '否'} · WebRTC{' '}
              {net.webrtc?.consistency ?? '—'}
            </li>
          </ul>
        );
      else body = <em className="wb-empty">尚無網路分析資料。</em>;
    } else if (def.key === 'workbench.hardware') {
      link = '/admin/devices';
      if (!showSummary) body = null;
      else if (hashKeys.length > 0)
        body = (
          <ul className="wb-list">
            {hashKeys.slice(0, limit).map((k) => (
              <li key={k}>指紋群：{k}</li>
            ))}
          </ul>
        );
      else body = <em className="wb-empty">尚無硬體指紋資料。</em>;
    } else if (def.key === 'workbench.browser') {
      link = '/admin/devices';
      if (!showSummary) body = null;
      else if (envKeys.length > 0)
        body = (
          <ul className="wb-list">
            {envKeys.slice(0, limit).map((k) => (
              <li key={k}>環境訊號：{k}</li>
            ))}
          </ul>
        );
      else body = <em className="wb-empty">尚無瀏覽器環境資料。</em>;
    } else if (def.key === 'workbench.raw') {
      link = report ? `/admin/reports/${encodeURIComponent(report.reportId)}` : '/admin/reports/demo';
      if (!showSummary) body = null;
      else if (report)
        body = (
          <ul className="wb-list">
            <li>signals {signals.length} · issues {issues.length}</li>
            <li>scores：{JSON.stringify(score).slice(0, 80)}</li>
          </ul>
        );
      else body = <em className="wb-empty">尚無原始資料。</em>;
    } else if (def.key === 'workbench.governance') {
      link = '/admin/layout';
      if (!showSummary) body = null;
      else if (snap.audits.length > 0)
        body = (
          <ul className="wb-list">
            {snap.audits.slice(0, limit).map((a, i) => (
              <li key={i}>
                {String(a.action ?? '')} · {fmtTime(a.createdAt)}
              </li>
            ))}
          </ul>
        );
      else body = <em className="wb-empty">尚無稽核紀錄。</em>;
    }

    cards.push({ key: def.key, icon: def.icon, title, link, body });
  }

  return (
    <div className="wb-grid">
      {cards.length === 0 && <div className="wb-empty">此頁所有區塊都已停用。</div>}
      {cards.map((c) => (
        <div className="wb-card" key={c.key}>
          <a className="wb-head" href={c.link}>
            <span style={{ fontSize: 18 }}>{c.icon}</span>
            <b>{c.title}</b>
            <span className="wb-go">→</span>
          </a>
          <div className="wb-body">
            {snap.loading ? <em className="wb-empty">載入中…</em> : (c.body ?? <em className="wb-empty">已停用即時摘要。</em>)}
          </div>
        </div>
      ))}
      <style>{`
        .wb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
        .wb-card{background:#15233c;border:1px solid #22344f;border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
        .wb-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #22344f;text-decoration:none;color:#e9eff8}
        .wb-head b{flex:1;font-size:13px}
        .wb-go{color:#4da3ff}
        .wb-body{padding:10px 12px;font-size:12.5px}
        .wb-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;color:#cfe3ff}
        .wb-list li{line-height:1.5}
        .wb-empty{color:#47618a;font-size:12px;line-height:1.6}
        .sev{display:inline-block;border-radius:999px;padding:0 6px;margin-right:6px;font-size:10.5px}
        .sev.critical{background:#40151d;color:#f87171}.sev.high{background:#3a1f10;color:#fbbf24}
        .sev.medium{background:#3a3117;color:#fde68a}.sev.low,.sev.info{background:#12314f;color:#9ecbff}
      `}</style>
    </div>
  );
}
