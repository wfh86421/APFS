'use client';

import { useState } from 'react';
import { apiBaseUrl } from '../../lib/api';

interface RiskEventItem {
  eventId: string;
  sessionId: string;
  eventType: string;
  severity: string;
  confidence: string;
  ruleId: string;
  ruleVersion: string;
  reviewRequired: boolean;
  detectedAt: string;
  evidenceJson?: Record<string, unknown>;
}

export default function AdminEventsList() {
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem('shieldscan.admin.apiKey') ?? '';
  });
  const [sessionId, setSessionId] = useState('');
  const [severity, setSeverity] = useState('');
  const [events, setEvents] = useState<RiskEventItem[]>([]);
  const [status, setStatus] = useState('');

  const load = async () => {
    if (!apiKey) {
      setStatus('請先填入管理 API Key。');
      return;
    }
    window.localStorage.setItem('shieldscan.admin.apiKey', apiKey);
    try {
      const params = new URLSearchParams();
      if (sessionId) params.set('sessionId', sessionId);
      if (severity) params.set('severity', severity);
      const response = await fetch(`${apiBaseUrl()}/v1/risk-events?${params.toString()}`, {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) throw new Error(`API 回應 ${response.status}`);
      const body = (await response.json()) as { events?: RiskEventItem[] };
      setEvents(body.events ?? []);
      setStatus(`已載入 ${body.events?.length ?? 0} 筆風險事件`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="decision-page">
      <h1>企業 Dashboard — 事件查詢</h1>
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
        <label>
          Session ID（選填）
          <input value={sessionId} onChange={(event) => setSessionId(event.target.value)} />
        </label>
        <label>
          Severity
          <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
            <option value="">全部</option>
            <option value="info">info</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="critical">critical</option>
          </select>
        </label>
        <button className="btn" onClick={load}>
          查詢事件
        </button>
      </div>
      {status && <p className="decision-status">{status}</p>}
      <div className="decision-card">
        <div className="decision-table-wrap">
          <table className="decision-table">
            <thead>
              <tr>
                <th>Event ID</th>
                <th>Session</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Confidence</th>
                <th>Rule</th>
                <th>Review</th>
                <th>Detected At</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.eventId}>
                  <td>{event.eventId}</td>
                  <td>{event.sessionId}</td>
                  <td>{event.eventType}</td>
                  <td>{event.severity}</td>
                  <td>{event.confidence}</td>
                  <td>{event.ruleId}</td>
                  <td>{event.reviewRequired ? '需複核' : '否'}</td>
                  <td>{new Date(event.detectedAt).toLocaleString()}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    尚無事件
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
