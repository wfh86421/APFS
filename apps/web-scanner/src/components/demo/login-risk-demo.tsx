'use client';

import { useState } from 'react';
import {
  audioModule,
  canvasModule,
  clientHintsModule,
  localeModule,
  screenModule,
  ShieldScanSDK,
  timezoneModule,
  uaModule,
  webglModule,
  webgpuModule,
  webrtcModule,
} from '@shieldscan/browser-sdk';
import { policyDecisionForRiskLevel, type EnvironmentReport, type PolicyDecision } from '@shieldscan/core-schema';
import type { ScoreResult } from '@shieldscan/scoring-engine';
import { analyzeSignals } from '../../lib/analyze';
import { apiBaseUrl } from '../../lib/api';

const MODULES = [
  uaModule,
  clientHintsModule,
  canvasModule,
  webglModule,
  webgpuModule,
  audioModule,
  screenModule,
  localeModule,
  timezoneModule,
  webrtcModule,
];

const POLICY_LABELS: Record<PolicyDecision, string> = {
  allow: '允許登入',
  review: '人工複核',
  challenge: '要求二次驗證',
  limit: '限制存取',
  block: '拒絕登入',
  log_only: '僅記錄',
};

/** 與伺服器共用同一決策表（core-schema policyDecisionForRiskLevel），避免 medium/high 交錯漂移。 */
function decisionFor(riskLevel: ScoreResult['riskLevel']) {
  const policy = policyDecisionForRiskLevel(riskLevel);
  return { label: POLICY_LABELS[policy] ?? policy, policy };
}

export default function LoginRiskDemo() {
  const [state, setState] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle');
  const [report, setReport] = useState<EnvironmentReport | null>(null);
  const [score, setScore] = useState<ScoreResult | null>(null);
  const [message, setMessage] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const scan = async () => {
    setState('scanning');
    setActionMessage('');
    try {
      const sdk = new ShieldScanSDK({ sdkVersion: '0.1.0' });
      for (const module of MODULES) sdk.register(module);
      const session = await sdk.scan();
      const signals = await session.waitForCompletion();
      const local = await analyzeSignals(signals, { mode: 'standard', retentionDays: 90 });

      const response = await fetch(`${apiBaseUrl()}/v1/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ report: local.report, profileId: 'login-risk' }),
      });
      if (!response.ok) throw new Error(`伺服器回應 ${response.status}`);
      const body = (await response.json()) as { score: ScoreResult };

      setReport(local.report);
      setScore(body.score);
      setMessage(`建議動作：${decisionFor(body.score.riskLevel).label}`);
      setState('done');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  };

  return (
    <div className="decision-page">
      <h1>垂直場景 Demo：登入風控</h1>
      <p className="subtitle">
        模擬「登入／註冊前風險檢查」：掃描環境 → 伺服器評分 → 建議 allow／challenge／review／block。
      </p>
      <button className="btn btn-primary" onClick={scan} disabled={state === 'scanning'}>
        {state === 'scanning' ? '掃描中…' : '開始登入風控檢查'}
      </button>

      {message && <p className="decision-status">{message}</p>}
      {score && (
        <section className="decision-card decision-hero">
          <div>
            <h2>判定結果</h2>
            <div className="decision-score-row">
              <div>
                <b className="decision-score">{score.finalScore}</b>
                <span>/100</span>
              </div>
              <div className="decision-meta">
                <span className="badge badge-warn">Risk: {score.riskLevel}</span>
                <span className="badge badge-good">Privacy: {score.privacyScore}</span>
                <span className="badge badge-bad">Fraud: {score.fraudScore}</span>
              </div>
            </div>
            <h3>主要因素</h3>
            {score.explanations.map((factor) => (
              <div className="decision-factor" key={factor.ruleId}>
                <b>{factor.reason}</b>
                <span>
                  Track {factor.track}・Severity {factor.severity}・Points -{factor.points}
                </span>
              </div>
            ))}
            <p className="muted">Report: {report?.reportId}</p>
          </div>
          <div className="decision-actions">
            <button className="btn" onClick={() => setActionMessage('登入已放行（示範）。')}>
              允許登入
            </button>
            <button className="btn" onClick={() => setActionMessage('已要求二次驗證（示範）。')}>
              要求二次驗證
            </button>
            <button
              className="btn btn-danger"
              onClick={() => setActionMessage('已拒絕登入並標記（示範）。')}
            >
              拒絕登入
            </button>
          </div>
          {actionMessage && <p className="decision-status">{actionMessage}</p>}
        </section>
      )}
    </div>
  );
}
