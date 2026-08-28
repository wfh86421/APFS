import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCHEMA_VERSION, type EnvironmentReport } from '@shieldscan/core-schema';
import { signReport, verifySignedReport } from '@shieldscan/signing';

function makeReport(overrides: Partial<EnvironmentReport> = {}): EnvironmentReport {
  const now = new Date().toISOString();
  return {
    reportId: 'report-1',
    schemaVersion: SCHEMA_VERSION,
    sessionId: 'session-1',
    source: 'web',
    createdAt: now,
    consent: { mode: 'standard' },
    sdk: { name: '@shieldscan/browser-sdk', version: '0.1.0', platform: 'browser' },
    signals: [
      {
        id: 's1',
        pluginId: 'browser.canvas',
        pluginVersion: '0.1.0',
        platform: 'browser',
        category: 'hardware',
        key: 'canvas',
        value: { isTampered: false },
        confidence: 0.95,
        collectedAt: now,
      },
    ],
    issues: [],
    scores: {
      privacyExposure: 80,
      authenticity: 80,
      automationRisk: 20,
      networkTrust: 80,
    },
    integrity: {
      signature: '',
      nonce: 'nonce-123',
      timestamp: now,
      sdkVersion: '0.1.0',
    },
    ...overrides,
  };
}

test('簽章與驗證通過', async () => {
  const report = makeReport();
  report.integrity.signature = await signReport(report, 'secret-key');
  const result = await verifySignedReport(report, 'secret-key');
  assert.equal(result.valid, true);
});

test('竄改 signals 會驗證失敗', async () => {
  const report = makeReport();
  report.integrity.signature = await signReport(report, 'secret-key');
  (report.signals[0]!.value as Record<string, unknown>).isTampered = true;
  const result = await verifySignedReport(report, 'secret-key');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'signature_mismatch');
});

test('錯誤 secret 驗證失敗', async () => {
  const report = makeReport();
  report.integrity.signature = await signReport(report, 'secret-key');
  const result = await verifySignedReport(report, 'wrong-key');
  assert.equal(result.valid, false);
});

test('過期時間戳驗證失敗', async () => {
  const report = makeReport({
    integrity: {
      signature: '',
      nonce: 'nonce-123',
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      sdkVersion: '0.1.0',
    },
  });
  report.integrity.signature = await signReport(report, 'secret-key');
  const result = await verifySignedReport(report, 'secret-key', { maxAgeMs: 300000 });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'expired');
});

test('缺少簽名驗證失敗', async () => {
  const report = makeReport();
  const result = await verifySignedReport(report, 'secret-key');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'missing_signature');
});
