'use client';

import type {
  AnalysisIssue,
  EnvironmentReport,
  NormalizedSignal,
  Severity,
} from '@shieldscan/core-schema';
import type { ScoreResult } from '@shieldscan/scoring-engine';

function signalValue(signals: NormalizedSignal[], key: string): unknown {
  return signals.find((s) => s.key === key)?.value;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function severityBadge(severity: Severity) {
  const className =
    severity === 'high' || severity === 'critical'
      ? 'badge badge-bad'
      : severity === 'medium'
        ? 'badge badge-warn'
        : 'badge';
  return <span className={className}>{severity}</span>;
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const fillClass = value >= 70 ? 'good' : value >= 50 ? 'warn' : 'bad';
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span>{label}</span>
        <span className="muted">{value}</span>
      </div>
      <div className="bar">
        <div className={`bar-fill ${fillClass}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function ReportView({
  report,
  score,
  elapsedMs,
  onExport,
}: {
  report: EnvironmentReport;
  score: ScoreResult;
  elapsedMs: number;
  onExport: () => void;
}) {
  const riskClass =
    score.riskLevel === 'critical' || score.riskLevel === 'high'
      ? 'badge-bad'
      : score.riskLevel === 'medium'
        ? 'badge-warn'
        : 'badge-good';
  const scoreClass =
    score.finalScore >= 70 ? 'good' : score.finalScore >= 50 ? 'warn' : 'bad';

  const hardwareSignals = report.signals.filter((s) =>
    ['canvas', 'webgl', 'webgpu', 'audio', 'screen'].includes(s.key),
  );
  const browserSignals = report.signals.filter((s) =>
    ['ua', 'clientHints', 'locale', 'timezone'].includes(s.key),
  );
  const networkSignals = report.signals.filter((s) => s.key === 'webrtc');

  return (
    <>
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2>隱私評分</h2>
            <div className="score-gauge">
              <span className={`score-number ${scoreClass}`} style={{ color: `var(--${scoreClass})` }}>
                {score.finalScore}
              </span>
              <span className="badge badge-good">{score.grade}</span>
              <span className={`badge ${riskClass}`}>{score.riskLevel}</span>
            </div>
          </div>
          <button className="btn" onClick={onExport}>
            匯出 JSON
          </button>
        </div>

        <dl className="kv" style={{ marginTop: 14 }}>
          <dt>掃描耗時</dt>
          <dd>{elapsedMs} ms</dd>
          <dt>報告 ID</dt>
          <dd>{report.reportId}</dd>
          <dt>Session</dt>
          <dd>{report.sessionId}</dd>
          <dt>SDK</dt>
          <dd>
            {report.sdk.name}@{report.sdk.version}
          </dd>
          <dt>同意模式</dt>
          <dd>
            {report.consent.mode}
            {report.consent.retentionDays
              ? `（保留 ${report.consent.retentionDays} 天）`
              : ''}
          </dd>
          <dt>資料契約版本</dt>
          <dd>{report.schemaVersion}</dd>
        </dl>

        <div style={{ marginTop: 12 }}>
          <ScoreBar label="隱私暴露（越低越好）" value={report.scores.privacyExposure} />
          <ScoreBar label="環境真實性" value={report.scores.authenticity} />
          <ScoreBar label="自動化風險" value={report.scores.automationRisk} />
          <ScoreBar label="網路信任" value={report.scores.networkTrust} />
        </div>
      </section>

      <section className="card">
        <h2>異常與風險（Issues）</h2>
        {report.issues.length === 0 && (
          <p className="muted" style={{ marginTop: 0 }}>
            未發現一致性異常。
          </p>
        )}
        {report.issues.map((issue: AnalysisIssue) => (
          <div className={`issue sev-${issue.severity}`} key={issue.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong>{issue.type}</strong>
              {severityBadge(issue.severity)}
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
              {issue.description}
            </div>
            <pre
              style={{
                fontSize: 11,
                color: 'var(--muted)',
                margin: '6px 0 0',
                overflowX: 'auto',
              }}
            >
              {JSON.stringify(issue.evidence, null, 2)}
            </pre>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>硬體指紋（Hardware）</h2>
        {hardwareSignals.length === 0 && (
          <p className="muted" style={{ marginTop: 0 }}>無資料</p>
        )}
        {hardwareSignals.map((s) => (
          <details key={s.id} style={{ marginBottom: 8 }}>
            <summary>
              <strong>{s.pluginId}</strong>{' '}
              <span className="muted" style={{ fontSize: 12 }}>
                confidence {s.confidence}
              </span>
            </summary>
            <pre style={{ fontSize: 12, overflowX: 'auto' }}>
              {formatValue(s.value)}
            </pre>
          </details>
        ))}
      </section>

      <section className="card">
        <h2>瀏覽器環境（Browser）</h2>
        {browserSignals.length === 0 && (
          <p className="muted" style={{ marginTop: 0 }}>無資料</p>
        )}
        {browserSignals.map((s) => (
          <details key={s.id} style={{ marginBottom: 8 }}>
            <summary>
              <strong>{s.pluginId}</strong>{' '}
              <span className="muted" style={{ fontSize: 12 }}>
                confidence {s.confidence}
              </span>
            </summary>
            <pre style={{ fontSize: 12, overflowX: 'auto' }}>
              {formatValue(s.value)}
            </pre>
          </details>
        ))}
      </section>

      <section className="card">
        <h2>網路環境（Network）</h2>
        {networkSignals.length === 0 && (
          <p className="muted" style={{ marginTop: 0 }}>無資料</p>
        )}
        {networkSignals.map((s) => (
          <details key={s.id} style={{ marginBottom: 8 }}>
            <summary>
              <strong>{s.pluginId}</strong>{' '}
              <span className="muted" style={{ fontSize: 12 }}>
                confidence {s.confidence}
              </span>
            </summary>
            <pre style={{ fontSize: 12, overflowX: 'auto' }}>
              {formatValue(s.value)}
            </pre>
          </details>
        ))}
        <p className="muted" style={{ marginBottom: 0, fontSize: 13 }}>
          WebRTC 是否洩漏需由 Server 端與公網 IP 比對（Phase 2）。
        </p>
      </section>
    </>
  );
}
