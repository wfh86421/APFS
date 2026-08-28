import type { EnvironmentReport } from '@shieldscan/core-schema';
import { collectServerSignals } from '@shieldscan/node-sdk';
import { defaultRules, ScoringEngine } from '@shieldscan/scoring-engine';
import { signReport, verifySignedReport } from '@shieldscan/signing';

const signingSecret = process.env.REPORT_SIGNING_SECRET ?? 'demo-secret';
const apiKey = process.env.SHIELDSCAN_API_KEY;
const apiUrl = process.env.SHIELDSCAN_API_URL ?? 'http://localhost:3001';

const report: EnvironmentReport = {
  reportId: crypto.randomUUID(),
  schemaVersion: '0.1.0',
  sessionId: crypto.randomUUID(),
  source: 'node',
  createdAt: new Date().toISOString(),
  consent: { mode: 'standard', retentionDays: 90 },
  sdk: { name: '@shieldscan/node-sdk', version: '0.1.0', platform: 'node' },
  signals: [],
  issues: [],
  scores: {
    privacyExposure: 0,
    authenticity: 0,
    automationRisk: 0,
    networkTrust: 0,
  },
  integrity: {
    signature: '',
    nonce: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    sdkVersion: '0.1.0',
  },
};

// 1. 附加 Server 端信任錨點訊號。
report.signals = await collectServerSignals({
  headers: { 'user-agent': 'ShieldScan-Node-Demo/0.1' },
  ip: '49.214.1.196',
});

// 2. 正式簽章。
report.integrity.signature = await signReport(report, signingSecret);
console.log('已簽章，signature =', report.integrity.signature.slice(0, 16) + '…');

// 3. 驗證簽章（模擬伺服器端）。
const verification = await verifySignedReport(report, signingSecret);
console.log('簽章驗證：', verification.valid, verification.reason);

// 4. 本地評分預覽。
const engine = new ScoringEngine();
for (const rule of defaultRules()) engine.registerRule(rule);
const score = await engine.calculate(report, report.issues, {
  profileId: 'privacy-default',
  weights: {},
  thresholds: { allow: 70, review: 60, challenge: 50, block: 30 },
});
console.log('本地評分：', score.finalScore, score.grade);

// 5. 呼叫平台 API（有 API Key 時）。
if (apiKey) {
  const response = await fetch(`${apiUrl}/v1/reports`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(report),
  });
  const body = (await response.json()) as Record<string, unknown>;
  console.log('平台回傳：', response.status, JSON.stringify(body).slice(0, 300));
} else {
  console.log('未設定 SHIELDSCAN_API_KEY，跳過平台上傳。');
}
