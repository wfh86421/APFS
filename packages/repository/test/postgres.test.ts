import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCHEMA_VERSION, type EnvironmentReport } from '@shieldscan/core-schema';
import { PostgresReportRepository } from '@shieldscan/repository';

/**
 * PostgreSQL 執行期整合測試。
 *
 * 只在 DATABASE_URL 存在時執行（CI 的 postgres service、或 docker compose 環境）。
 * 本機沒有 Postgres 時自動 skip，不影響開發。
 */
const databaseUrl = process.env.DATABASE_URL;

function makeReport(): EnvironmentReport {
  const now = new Date().toISOString();
  return {
    reportId: crypto.randomUUID(),
    schemaVersion: SCHEMA_VERSION,
    sessionId: crypto.randomUUID(),
    subjectId: 'ci-visitor',
    source: 'web',
    createdAt: now,
    consent: { mode: 'stored', retentionDays: 90 },
    sdk: { name: '@shieldscan/browser-sdk', version: '0.1.0', platform: 'browser' },
    signals: [
      {
        id: crypto.randomUUID(),
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
      nonce: crypto.randomUUID(),
      timestamp: now,
      sdkVersion: '0.1.0',
    },
  };
}

test('PostgreSQL 儲存/查詢/歷史/訪客（執行期驗證）', { skip: !databaseUrl }, async () => {
  assert.ok(databaseUrl, '需要 DATABASE_URL');
  const repo = new PostgresReportRepository(databaseUrl);
  try {
    const report = makeReport();
    await repo.saveReport(report, {
      clientIp: '49.214.1.196',
      privacyScore: 85,
      grade: 'A',
      riskLevel: 'low',
      retentionDays: 90,
    });

    const stored = await repo.getReport(report.reportId);
    assert.ok(stored);
    assert.equal(stored.privacyScore, 85);
    assert.equal(stored.clientIp, '49.214.1.196');
    assert.equal(stored.signals.length, 1);

    const history = await repo.listReportsByVisitor('ci-visitor');
    assert.ok(history.length >= 1);

    await repo.upsertVisitor('ci-visitor', {
      visitorId: 'ci-visitor',
      canvasHash: 'abc123',
      scanCount: 1,
      ipHistory: ['49.214.1.196'],
    });
    const visitor = await repo.getVisitor('ci-visitor');
    assert.ok(visitor);
    assert.equal(visitor.canvasHash, 'abc123');

    // 清理測試資料（可刪除驗收）。
    await repo.close();
  } catch (err) {
    await repo.close();
    throw err;
  }
});
