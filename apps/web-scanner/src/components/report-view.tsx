'use client';

import type {
  AnalysisIssue,
  EnvironmentReport,
  NormalizedSignal,
  PolicyDecision,
  Severity,
} from '@shieldscan/core-schema';
import type { ScoreResult } from '@shieldscan/scoring-engine';
import type { ServerNetworkAnalysis } from '../lib/api';

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
  policy,
  network,
  analysisSource,
  warning,
  onExport,
  sections,
}: {
  report: EnvironmentReport;
  score: ScoreResult;
  elapsedMs: number;
  policy?: PolicyDecision;
  network?: ServerNetworkAnalysis;
  analysisSource: 'local' | 'server';
  warning?: string;
  onExport: () => void;
  sections?: {
    score?: boolean;
    issues?: boolean;
    hardware?: boolean;
    browser?: boolean;
    network?: boolean;
    next?: boolean;
  };
}) {
  const show = {
    score: sections?.score ?? true,
    issues: sections?.issues ?? true,
    hardware: sections?.hardware ?? true,
    browser: sections?.browser ?? true,
    network: sections?.network ?? true,
    next: sections?.next ?? true,
  };
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
      {warning && (
        <section className="card" style={{ borderLeftColor: 'var(--warn)' }}>
          <p style={{ margin: 0, color: 'var(--warn)' }}>⚠️ {warning}</p>
        </section>
      )}

      {show.score && (
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2>
              隱私評分{' '}
              <span className="badge" style={{ color: 'var(--accent)' }}>
                {analysisSource === 'server' ? '伺服器分析' : '本機預覽'}
              </span>
              {policy && (
                <span className="badge" style={{ color: 'var(--accent)' }}>
                  policy: {policy}
                </span>
              )}
            </h2>
            <div className="score-gauge">
              <span className={`score-number ${scoreClass}`} style={{ color: `var(--${scoreClass})` }}>
                {score.finalScore}
              </span>
              <span className="badge badge-good">{score.grade}</span>
              <span className={`badge ${riskClass}`}>{score.riskLevel}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <span className="badge badge-good">隱私軌 {score.privacyScore}/100</span>
              <span className="badge badge-warn">欺詐軌 {score.fraudScore}/100</span>
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

        {score.explanations && score.explanations.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <h3 style={{ fontSize: 14 }}>風險因素解釋</h3>
            {score.explanations.map((factor) => (
              <div className="decision-factor" key={factor.ruleId} style={{ fontSize: 13 }}>
                <b>{factor.reason}</b>
                <span>
                  Track {factor.track}・Severity {factor.severity}・扣 {factor.points} 分
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
      )}

      {show.issues && (
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
      )}

      {show.hardware && (
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
      )}

      {show.browser && (
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
      )}

      {show.network && (
      <section className="card">
        <h2>網路環境（Network）</h2>
        {network && (
          <dl className="kv" style={{ marginBottom: 12 }}>
            <dt>來源 IP</dt>
            <dd>{network.ip}</dd>
            <dt>ISP / ASN</dt>
            <dd>
              {network.geo
                ? `${network.geo.isp ?? '未知'} / ${network.geo.asn ?? '未知'}`
                : '未知（本機/內網）'}
            </dd>
            <dt>風險等級</dt>
            <dd>{network.riskLevel}</dd>
            <dt>Proxy / VPN / Tor / DC</dt>
            <dd>
              {network.proxy ? 'Proxy ' : ''}
              {network.vpn ? 'VPN ' : ''}
              {network.tor ? 'Tor ' : ''}
              {network.datacenter ? 'DataCenter' : ''}
              {!network.proxy && !network.vpn && !network.tor && !network.datacenter
                ? '無（一般家用/行動線路）'
                : ''}
            </dd>
            <dt>WebRTC 一致性</dt>
            <dd>{network.webrtc.consistency}</dd>
            <dt>DNS leak</dt>
            <dd>{network.dnsLeak ? (network.dnsLeak.detected ? '偵測到' : '未偵測') : '無樣本'}</dd>
          </dl>
        )}
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
        {!network && (
          <p className="muted" style={{ marginBottom: 0, fontSize: 13 }}>
            WebRTC 是否洩漏需由 Server 端與公網 IP 比對（standard / stored 模式會上傳分析）。
          </p>
        )}
      </section>
      )}

      {show.next && (
        <section className="card">
          <h2>下一步</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            想讓偵測成為你產品流程的一環？
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a className="btn" href="/register">
              API 自助註冊
            </a>
            <a className="btn" href="/demo/login-risk">
              看登入風控 Demo
            </a>
            <a className="btn" href="/pricing">
              查看定價
            </a>
          </div>
        </section>
      )}
    </>
  );
}
