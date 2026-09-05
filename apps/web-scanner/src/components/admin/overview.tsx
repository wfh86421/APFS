'use client';

import { useState } from 'react';
import { apiBaseUrl } from '../../lib/api';

interface ReportItem {
  riskLevel?: string;
  createdAt?: string;
}

interface EventItem {
  severity?: string;
  eventType?: string;
  detectedAt?: string;
}

interface OverviewData {
  reports: ReportItem[];
  events: EventItem[];
  deviceCount: number;
}

const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;

export default function AdminOverview() {
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem('shieldscan.admin.apiKey') ?? '';
  });
  const [data, setData] = useState<OverviewData | null>(null);
  const [status, setStatus] = useState('');

  const load = async () => {
    if (!apiKey) {
      setStatus('請先填入管理 API Key。');
      return;
    }
    window.localStorage.setItem('shieldscan.admin.apiKey', apiKey);
    try {
      const headers = { authorization: `Bearer ${apiKey}` };
      const reportsRes = await fetch(`${apiBaseUrl()}/v1/reports?limit=200`, { headers });
      const eventsRes = await fetch(`${apiBaseUrl()}/v1/risk-events?limit=200`, { headers });
      const devicesRes = await fetch(`${apiBaseUrl()}/v1/devices?limit=200`, { headers });
      if (!reportsRes.ok || !eventsRes.ok || !devicesRes.ok) {
        throw new Error('Dashboard API 回應失敗');
      }
      const reportsBody = (await reportsRes.json()) as { reports?: ReportItem[] };
      const eventsBody = (await eventsRes.json()) as { events?: EventItem[] };
      const devicesBody = (await devicesRes.json()) as { devices?: unknown[] };
      setData({
        reports: reportsBody.reports ?? [],
        events: eventsBody.events ?? [],
        deviceCount: devicesBody.devices?.length ?? 0,
      });
      setStatus('已載入概覽資料');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const severityCounts = (events: EventItem[]) =>
    SEVERITIES.map((severity) => ({
      severity,
      count: events.filter((event) => event.severity === severity).length,
    }));

  const dailyCounts = (items: Array<{ at?: string }>) => {
    const days: string[] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      days.push(date.toISOString().slice(0, 10));
    }
    return days.map((day) => ({
      day: day.slice(5),
      count: items.filter((item) => (item.at ?? '').slice(0, 10) === day).length,
    }));
  };

  return (
    <div className="decision-page">
      <h1>管理概覽</h1>
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
          載入概覽
        </button>
      </div>
      {status && <p className="decision-status">{status}</p>}
      {data && (
        <>
          <div className="stats-card-grid">
            <div className="decision-card stat-summary">
              <b>報告總數</b>
              <span>{data.reports.length}</span>
            </div>
            <div className="decision-card stat-summary">
              <b>高風險報告</b>
              <span>
                {
                  data.reports.filter(
                    (report) => report.riskLevel === 'high' || report.riskLevel === 'critical',
                  ).length
                }
              </span>
            </div>
            <div className="decision-card stat-summary">
              <b>風險事件</b>
              <span>{data.events.length}</span>
            </div>
            <div className="decision-card stat-summary">
              <b>設備指紋</b>
              <span>{data.deviceCount}</span>
            </div>
          </div>

          <div className="decision-card">
            <h2>事件 Severity 分布</h2>
            {severityCounts(data.events).map(({ severity, count }) => (
              <div key={severity} className="trend-row">
                <span className="trend-label">{severity}</span>
                <div className="bar">
                  <div
                    className={`bar-fill ${severity === 'high' || severity === 'critical' ? 'bad' : ''}`}
                    style={{ width: `${data.events.length ? (count / data.events.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="trend-count">{count}</span>
              </div>
            ))}
          </div>

          <div className="trend-grid">
            <div className="decision-card">
              <h2>報告近 7 天趨勢</h2>
              {dailyCounts(data.reports.map((report) => ({ at: report.createdAt }))).map(
                ({ day, count }) => (
                  <div key={day} className="trend-row">
                    <span className="trend-label">{day}</span>
                    <div className="bar">
                      <div className="bar-fill" style={{ width: `${Math.min(100, count * 10)}%` }} />
                    </div>
                    <span className="trend-count">{count}</span>
                  </div>
                ),
              )}
            </div>
            <div className="decision-card">
              <h2>事件近 7 天趨勢</h2>
              {dailyCounts(data.events.map((event) => ({ at: event.detectedAt }))).map(
                ({ day, count }) => (
                  <div key={day} className="trend-row">
                    <span className="trend-label">{day}</span>
                    <div className="bar">
                      <div className="bar-fill warn" style={{ width: `${Math.min(100, count * 10)}%` }} />
                    </div>
                    <span className="trend-count">{count}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
