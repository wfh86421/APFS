'use client';

import { useEffect, useState } from 'react';
import type { EnvironmentReport, NormalizedSignal } from '@shieldscan/core-schema';
import type { ScoreResult } from '@shieldscan/scoring-engine';
import { apiBaseUrl } from '../../lib/api';
import { getAdminSiteConfig } from '../../lib/config-api';
import type { WorkspaceConfig } from '../../modules/catalog';
import { loadWorkspaceConfig, isWorkspaceConfigLike } from '../../modules/store';

interface StoredReportLike extends EnvironmentReport {
  clientIp?: string;
  privacyScore?: number;
  grade?: string;
  riskLevel?: string;
}

interface RiskEventItem {
  eventId: string;
  eventType: string;
  severity: string;
  confidence: string;
  ruleId: string;
}

function showList(signals: NormalizedSignal[], keys: string[], title: string) {
  const list = signals.filter((signal) => keys.includes(signal.key));
  return (
    <div>
      <h3 style={{ fontSize: 14 }}>{title}</h3>
      {list.length === 0 && <p className="muted">無資料</p>}
      {list.map((signal) => (
        <details key={signal.id}>
          <summary>{signal.key}</summary>
          <pre style={{ fontSize: 12, overflowX: 'auto' }}>
            {JSON.stringify(signal.value, null, 2)}
          </pre>
        </details>
      ))}
    </div>
  );
}

export default function ReportDetailPage({ reportId }: { reportId: string }) {
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem('shieldscan.admin.apiKey') ?? '';
  });
  const [report, setReport] = useState<StoredReportLike | null>(null);
  const [score, setScore] = useState<ScoreResult | null>(null);
  const [events, setEvents] = useState<RiskEventItem[]>([]);
  const [config, setConfig] = useState<WorkspaceConfig | null>(null);
  const [status, setStatus] = useState('載入中…');
  const [actionMessage, setActionMessage] = useState('');

  useEffect(() => {
    (async () => {
      let workspace = loadWorkspaceConfig();
      const key = window.localStorage.getItem('shieldscan.admin.apiKey') ?? '';
      if (key) {
        try {
          const remote = await getAdminSiteConfig('workbench', key);
          if (isWorkspaceConfigLike(remote)) workspace = remote;
        } catch {
          // fallback local
        }
      }
      setConfig(workspace);
      if (!key) {
        setStatus('請先填入管理 API Key。');
        return;
      }
      await loadReport(key);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadReport = async (key: string) => {
    try {
      const headers = { authorization: `Bearer ${key}` };
      const reportRes = await fetch(`${apiBaseUrl()}/v1/reports/${encodeURIComponent(reportId)}`, {
        headers,
      });
      if (!reportRes.ok) throw new Error(`報告讀取失敗：${reportRes.status}`);
      const body = (await reportRes.json()) as StoredReportLike;
      setReport(body);
      setScore({
        finalScore: body.privacyScore ?? body.scores.privacyExposure,
        maxScore: 100,
        grade: (body.grade as ScoreResult['grade']) ?? 'F',
        privacyScore: body.privacyScore ?? 0,
        fraudScore: 100 - (body.privacyScore ?? 0),
        deductions: [],
        privacyDeductions: [],
        fraudDeductions: [],
        explanations: [],
        riskLevel: (body.riskLevel as ScoreResult['riskLevel']) ?? 'low',
      });

      const eventRes = await fetch(
        `${apiBaseUrl()}/v1/risk-events?sessionId=${encodeURIComponent(body.sessionId)}`,
        { headers },
      );
      if (eventRes.ok) {
        const eventBody = (await eventRes.json()) as { events?: RiskEventItem[] };
        setEvents(eventBody.events ?? []);
      }
      setStatus('已載入真實報告');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const runQuickAction = async (decision: 'allow' | 'review' | 'block') => {
    if (!apiKey || !report) return;
    try {
      const headers = {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      };
      const reviewRes = await fetch(`${apiBaseUrl()}/v1/reports/${report.reportId}/review`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: `詳情頁快速處置：${decision}`, decision }),
      });
      if (!reviewRes.ok) throw new Error(`審查建立失敗：${reviewRes.status}`);
      const body = (await reviewRes.json()) as { case?: { caseId?: string } };
      if (body.case?.caseId) {
        await fetch(`${apiBaseUrl()}/v1/review-cases/${body.case.caseId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ status: 'reviewed', decision }),
        });
      }
      setActionMessage(`已完成：${decision}`);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : String(err));
    }
  };

  if (!config) return <div className="admin-page">載入中…</div>;
  const active = new Set(
    config.modules.filter((module) => module.enabled && module.visible).map((module) => module.id),
  );
  const show = (id: string) => active.has(id);

  return (
    <div className="decision-page">
      <h1>報告詳情：{reportId}</h1>
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
        <button
          className="btn"
          onClick={() => {
            window.localStorage.setItem('shieldscan.admin.apiKey', apiKey);
            if (apiKey) void loadReport(apiKey);
          }}
        >
          載入報告
        </button>
      </div>
      {status && <p className="decision-status">{status}</p>}

      {report && show('decision.verdict') && (
        <section className="decision-card decision-hero">
          <div>
            <h2>① 決策樞紐</h2>
            <div className="decision-score-row">
              <div>
                <b className="decision-score">{score?.finalScore ?? '-'}</b>
                <span>/100</span>
              </div>
              <div className="decision-meta">
                <span className="badge badge-bad">Risk: {report.riskLevel ?? '-'}</span>
                <span className="badge badge-warn">Privacy: {score?.privacyScore ?? '-'}</span>
                <span className="badge badge-bad">Fraud: {score?.fraudScore ?? '-'}</span>
              </div>
            </div>
            <dl className="kv">
              <div>
                <dt>Session</dt>
                <dd>{report.sessionId}</dd>
              </div>
              <div>
                <dt>Client IP</dt>
                <dd>{report.clientIp ?? '-'}</dd>
              </div>
            </dl>
          </div>
          <div className="decision-actions">
            <button className="btn" onClick={() => runQuickAction('allow')}>
              白名單
            </button>
            <button className="btn" onClick={() => runQuickAction('review')}>
              標記可疑
            </button>
            <button className="btn btn-danger" onClick={() => runQuickAction('block')}>
              封鎖
            </button>
          </div>
          {actionMessage && <p className="decision-status">{actionMessage}</p>}
        </section>
      )}

      {report && show('risk.conflicts') && (
        <section className="decision-card">
          <h2>② 異常與一致性矩陣</h2>
          {report.issues.length === 0 && events.length === 0 && (
            <p className="muted">無異常事件</p>
          )}
          {report.issues.map((issue) => (
            <div className="issue" key={issue.id}>
              <b>{issue.type}</b> — {issue.description}
            </div>
          ))}
          {events.map((event) => (
            <div className="issue" key={event.eventId}>
              <b>
                {event.eventType} / {event.severity}
              </b>{' '}
              — {event.ruleId}
            </div>
          ))}
        </section>
      )}

      {report && show('network.geo') && (
        <section className="decision-card">
          <h2>③ 網路、IP 與地理</h2>
          {showList(report.signals, ['webrtc'], 'WebRTC')}
          <dl className="kv">
            <div>
              <dt>Client IP</dt>
              <dd>{report.clientIp ?? '-'}</dd>
            </div>
          </dl>
        </section>
      )}

      {report && show('hardware.fp') && (
        <section className="decision-card">
          <h2>④ 硬體與設備指紋</h2>
          {showList(report.signals, ['canvas', 'webgl', 'webgpu', 'audio', 'screen'], '訊號')}
        </section>
      )}

      {report && show('browser.env') && (
        <section className="decision-card">
          <h2>⑤ 瀏覽器與軟體環境</h2>
          {showList(
            report.signals,
            ['ua', 'clientHints', 'locale', 'timezone'],
            '環境訊號',
          )}
        </section>
      )}

      {report && show('raw.payload') && (
        <section className="decision-card">
          <h2>⑥ 原始資料與稽核</h2>
          <pre className="decision-raw">{JSON.stringify(report, null, 2)}</pre>
        </section>
      )}

      {report && show('governance.audit') && (
        <section className="decision-card">
          <h2>⑦ 治理抽屜</h2>
          <p className="muted">
            完整稽核請至 /v1/audit-logs 查詢；此模組為 restricted。
          </p>
        </section>
      )}
    </div>
  );
}
