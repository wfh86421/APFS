'use client';

import { useState } from 'react';
import { apiBaseUrl } from '../../lib/api';

interface RoiResponse {
  window: { since: string; until: string };
  totals: { outcomeCount: number; fraudEvents: number };
  prevented: { count: number; estimatedAmount: number; note: string };
  shadow: { decisionLogCount: number; note: string };
  falsePositives: { count: number; falsePositiveRate: number };
}

const fmtMoney = (value: number) =>
  new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0,
  }).format(value);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' });

export default function AdminRoiView() {
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem('shieldscan.admin.apiKey') ?? '';
  });
  const [roi, setRoi] = useState<RoiResponse | null>(null);
  const [status, setStatus] = useState('');

  const load = async () => {
    if (!apiKey) {
      setStatus('請先填入管理 API Key。');
      return;
    }
    window.localStorage.setItem('shieldscan.admin.apiKey', apiKey);
    try {
      const response = await fetch(`${apiBaseUrl()}/v1/roi`, {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) throw new Error(`API 回應 ${response.status}`);
      const body = (await response.json()) as RoiResponse;
      setRoi(body);
      setStatus(`已載入成效數據（${fmtDate(body.window.since)} ~ ${fmtDate(body.window.until)}）`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="decision-page">
      <h1>企業 Dashboard — 決策成效 ROI</h1>
      <p className="subtitle">
        Shadow/反事實與事後結果回饋（/v1/roi）：被攔截的詐欺金額、誤殺率、規則決策覆蓋。
      </p>
      <div className="decision-config">
        <label>
          管理 API Key
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="shd_live_..."
          />
        </label>
        <button className="btn" onClick={load}>
          載入 ROI
        </button>
      </div>
      {status && <p className="decision-status">{status}</p>}

      {roi && (
        <>
          <section className="decision-card decision-hero">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 12,
                width: '100%',
              }}
            >
              <div>
                <b className="decision-score">{roi.prevented.count}</b>
                <div>已攔截詐欺事件</div>
                <small className="muted">當時決策為 block/challenge/review</small>
              </div>
              <div>
                <b className="decision-score">{fmtMoney(roi.prevented.estimatedAmount)}</b>
                <div>潛在挽回金額</div>
                <small className="muted">依回饋金額累計</small>
              </div>
              <div>
                <b className="decision-score">{roi.shadow.decisionLogCount}</b>
                <div>Shadow 反事實決策</div>
                <small className="muted">shadowMode 下 high/critical 的 would-action</small>
              </div>
              <div>
                <b className="decision-score">{roi.totals.outcomeCount}</b>
                <div>成效事件總數</div>
                <small className="muted">詐欺 {roi.totals.fraudEvents} 筆</small>
              </div>
              <div>
                <b className="decision-score">{roi.falsePositives.count}</b>
                <div>誤殺回饋</div>
                <small className="muted">FP/申訴成立</small>
              </div>
              <div>
                <b className="decision-score">{roi.falsePositives.falsePositiveRate}%</b>
                <div>誤殺率</div>
                <small className="muted">FP / (詐欺＋FP)</small>
              </div>
            </div>
          </section>
          <section className="decision-card">
            <h3>說明</h3>
            <ul className="muted">
              <li>攔截詐欺：{roi.prevented.note}</li>
              <li>Shadow：{roi.shadow.note}</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
