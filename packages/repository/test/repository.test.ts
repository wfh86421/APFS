import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCHEMA_VERSION, type EnvironmentReport } from '@shieldscan/core-schema';
import { InMemoryReportRepository } from '@shieldscan/repository';

function makeReport(overrides: Partial<EnvironmentReport> = {}): EnvironmentReport {
  const base: EnvironmentReport = {
    reportId: crypto.randomUUID(),
    schemaVersion: SCHEMA_VERSION,
    sessionId: crypto.randomUUID(),
    subjectId: 'visitor-a',
    source: 'web',
    createdAt: new Date().toISOString(),
    consent: { mode: 'standard', retentionDays: 90 },
    sdk: { name: '@shieldscan/browser-sdk', version: '0.1.0', platform: 'browser' },
    signals: [],
    issues: [],
    scores: {
      privacyExposure: 70,
      authenticity: 80,
      automationRisk: 20,
      networkTrust: 60,
    },
    integrity: {
      signature: 'sig',
      nonce: 'nonce',
      timestamp: new Date().toISOString(),
      sdkVersion: '0.1.0',
    },
    ...overrides,
  };
  return base;
}

test('save / get / list by visitor', async () => {
  const repo = new InMemoryReportRepository();
  const report = makeReport();

  await repo.saveReport(report, { clientIp: '49.214.1.196', privacyScore: 85, grade: 'A' });

  const stored = await repo.getReport(report.reportId);
  assert.ok(stored);
  assert.equal(stored.privacyScore, 85);
  assert.equal(stored.clientIp, '49.214.1.196');

  const history = await repo.listReportsByVisitor('visitor-a');
  assert.equal(history.length, 1);
  const first = history[0];
  assert.ok(first);
  assert.equal(first.reportId, report.reportId);

  const missing = await repo.getReport('nope');
  assert.equal(missing, null);
});

test('visitor upsert 累積 IP 歷史', async () => {
  const repo = new InMemoryReportRepository();
  const report1 = makeReport();
  await repo.saveReport(report1, { clientIp: '49.214.1.196' });
  const report2 = makeReport();
  await repo.saveReport(report2, { clientIp: '203.0.113.5' });

  const history = await repo.listReportsByVisitor('visitor-a');
  assert.equal(history.length, 2);

  await repo.upsertVisitor('visitor-a', {
    visitorId: 'visitor-a',
    scanCount: 1,
    ipHistory: ['49.214.1.196'],
    firstSeen: report1.createdAt,
    lastSeen: report1.createdAt,
  });
  await repo.upsertVisitor('visitor-a', {
    visitorId: 'visitor-a',
    scanCount: 1,
    ipHistory: ['203.0.113.5'],
    firstSeen: report1.createdAt,
    lastSeen: report2.createdAt,
  });
  const visitor = await repo.getVisitor('visitor-a');
  assert.ok(visitor);
  assert.deepEqual(visitor.ipHistory.sort(), ['203.0.113.5', '49.214.1.196']);
  assert.equal(visitor.scanCount, 2);
});

test('list 依時間倒序', async () => {
  const repo = new InMemoryReportRepository();
  const older = makeReport({ createdAt: '2026-08-01T00:00:00+08:00' });
  const newer = makeReport({ createdAt: '2026-08-28T00:00:00+08:00' });
  await repo.saveReport(older);
  await repo.saveReport(newer);

  const history = await repo.listReportsByVisitor('visitor-a');
  const first = history[0];
  assert.ok(first);
  assert.equal(first.reportId, newer.reportId);
});

test('deleteReport / deleteVisitor（可刪除驗收）', async () => {
  const repo = new InMemoryReportRepository();
  const report = makeReport();
  await repo.saveReport(report, { clientIp: '49.214.1.196' });
  await repo.upsertVisitor('visitor-a', {
    visitorId: 'visitor-a',
    scanCount: 1,
    ipHistory: ['49.214.1.196'],
    firstSeen: report.createdAt,
    lastSeen: report.createdAt,
  });

  assert.equal(await repo.deleteReport(report.reportId), true);
  assert.equal(await repo.getReport(report.reportId), null);
  assert.equal(await repo.deleteReport(report.reportId), false);

  const report2 = makeReport();
  await repo.saveReport(report2);
  assert.equal(await repo.deleteVisitor('visitor-a'), true);
  assert.equal(await repo.getVisitor('visitor-a'), null);
  assert.equal((await repo.listReportsByVisitor('visitor-a')).length, 0);
});
