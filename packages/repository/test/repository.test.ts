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
    tenantId: 'tenant-a',
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

  const stored = await repo.getReport('tenant-a', report.reportId);
  assert.ok(stored);
  assert.equal(stored.privacyScore, 85);
  assert.equal(stored.clientIp, '49.214.1.196');

  const history = await repo.listReportsByVisitor('tenant-a', 'visitor-a');
  assert.equal(history.length, 1);
  const first = history[0];
  assert.ok(first);
  assert.equal(first.reportId, report.reportId);

  const missing = await repo.getReport('tenant-a', 'nope');
  assert.equal(missing, null);
});

test('visitor upsert 累積 IP 歷史', async () => {
  const repo = new InMemoryReportRepository();
  const report1 = makeReport();
  await repo.saveReport(report1, { clientIp: '49.214.1.196' });
  const report2 = makeReport();
  await repo.saveReport(report2, { clientIp: '203.0.113.5' });

  const history = await repo.listReportsByVisitor('tenant-a', 'visitor-a');
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
  const visitor = await repo.getVisitor('tenant-a', 'visitor-a');
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

  const history = await repo.listReportsByVisitor('tenant-a', 'visitor-a');
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

  assert.equal(await repo.deleteReport('tenant-a', report.reportId), true);
  assert.equal(await repo.getReport('tenant-a', report.reportId), null);
  assert.equal(await repo.deleteReport('tenant-a', report.reportId), false);

  const report2 = makeReport();
  await repo.saveReport(report2);
  assert.equal(await repo.deleteVisitor('tenant-a', 'visitor-a'), true);
  assert.equal(await repo.getVisitor('tenant-a', 'visitor-a'), null);
  assert.equal((await repo.listReportsByVisitor('tenant-a', 'visitor-a')).length, 0);
});

test('租戶隔離：listReportsByTenant 只看得到自己的報告', async () => {
  const repo = new InMemoryReportRepository();
  await repo.saveReport(
    makeReport({ reportId: crypto.randomUUID(), tenantId: 'tenant-a', sessionId: 's-a1' }),
  );
  await repo.saveReport(
    makeReport({ reportId: crypto.randomUUID(), tenantId: 'tenant-b', sessionId: 's-b1' }),
  );

  const tenantA = await repo.listReportsByTenant('tenant-a');
  assert.equal(tenantA.length, 1);
  assert.equal(tenantA[0]?.tenantId, 'tenant-a');

  const tenantB = await repo.listReportsByTenant('tenant-b');
  assert.equal(tenantB.length, 1);
  assert.equal(tenantB[0]?.tenantId, 'tenant-b');
});

test('掃描計數：countReports 支援全部與租戶範圍', async () => {
  const repo = new InMemoryReportRepository();
  await repo.saveReport(
    makeReport({ reportId: crypto.randomUUID(), tenantId: 'tenant-a', sessionId: 's-a' }),
  );
  await repo.saveReport(
    makeReport({ reportId: crypto.randomUUID(), tenantId: 'tenant-b', sessionId: 's-b' }),
  );
  assert.equal(await repo.countReports(), 2);
  assert.equal(await repo.countReports('tenant-a'), 1);
});

test('listRecentClientIps：同裝置時窗內不同 IP（IP 速度）、租戶/時窗隔離', async () => {
  const repo = new InMemoryReportRepository();
  const fp = 'fp-velocity-001';
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

  // tenant-a、同裝置、近期兩個 IP
  await repo.saveReport(makeReport({ createdAt: now, sessionId: 'v1' }), {
    clientIp: '49.214.1.196',
    fingerprintHash: fp,
  });
  await repo.saveReport(makeReport({ createdAt: now, sessionId: 'v2' }), {
    clientIp: '203.0.113.9',
    fingerprintHash: fp,
  });
  // 10 天前（超出 7 天時窗）第三個 IP → 不計
  await repo.saveReport(makeReport({ createdAt: old, sessionId: 'v3' }), {
    clientIp: '198.51.100.7',
    fingerprintHash: fp,
  });
  // 另一 tenant 同 hash → 不計（租戶隔離）
  await repo.saveReport(
    makeReport({ tenantId: 'tenant-b', createdAt: now, sessionId: 'v4' }),
    { clientIp: '9.9.9.9', fingerprintHash: fp },
  );

  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recent = await repo.listRecentClientIps('tenant-a', fp, since7d);
  assert.deepEqual(recent, ['203.0.113.9', '49.214.1.196']);
});
