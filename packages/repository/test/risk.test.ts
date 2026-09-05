import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  AppealCase,
  FieldDefinition,
  ReviewCase,
  RiskEvent,
} from '@shieldscan/core-schema';
import {
  InMemoryRiskRepository,
  PostgresRiskRepository,
} from '@shieldscan/repository';

const databaseUrl = process.env.DATABASE_URL;

function makeRiskEvent(overrides: Partial<RiskEvent> = {}): RiskEvent {
  return {
    eventId: crypto.randomUUID(),
    tenantId: 'tenant_x',
    sessionId: 'session_risk',
    reportId: crypto.randomUUID(),
    eventType: 'open_ports',
    severity: 'high',
    confidence: 'medium',
    evidenceJson: { openPorts: [22, 3389] },
    ruleId: 'rule.open_ports_mobile',
    ruleVersion: '1.0.0',
    scoreImpact: -15,
    autoAction: 'review',
    reviewRequired: true,
    detectedAt: new Date().toISOString(),
    reviewStatus: 'pending',
    ...overrides,
  };
}

function makeFieldDefinition(): FieldDefinition {
  return {
    fieldPath: 'network.open_ports',
    displayName: '開放端口',
    category: 'network',
    sensitivity: 'high',
    defaultConfidence: 'medium',
    stability: 'volatile',
    purpose: '識別疑似伺服器/模擬器環境',
    retentionClass: 'short',
    accessRoles: ['security_admin', 'risk_analyst'],
    uiModule: 'network.geo',
    status: 'active',
    version: '1.0.0',
  };
}

function makeReviewCase(): ReviewCase {
  return {
    caseId: crypto.randomUUID(),
    sessionId: 'session_review',
    reportId: crypto.randomUUID(),
    riskEventIds: [crypto.randomUUID()],
    status: 'pending',
    priority: 'high',
    openedAt: new Date().toISOString(),
    reason: '開放端口與 OS 衝突，需人工複核',
    appealStatus: 'none',
  };
}

function makeAppeal(caseId: string): AppealCase {
  return {
    appealId: crypto.randomUUID(),
    caseId,
    reason: '此為隱私瀏覽器正常行為，請求複查',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
}

test('InMemory 風險事件：插入/依 session 查詢/依 severity 過濾', async () => {
  const repo = new InMemoryRiskRepository();
  await repo.insertRiskEvents([
    makeRiskEvent({ eventId: crypto.randomUUID(), sessionId: 's1', severity: 'high' }),
    makeRiskEvent({
      eventId: crypto.randomUUID(),
      sessionId: 's1',
      severity: 'medium',
      eventType: 'os_mismatch',
    }),
    makeRiskEvent({ eventId: crypto.randomUUID(), sessionId: 's2', severity: 'low' }),
  ]);

  const bySession = await repo.listRiskEvents({ sessionId: 's1' });
  assert.equal(bySession.length, 2);

  const highOnly = await repo.listRiskEvents({ severity: 'high' });
  assert.equal(highOnly.length, 1);

  const osOnly = await repo.listRiskEvents({ eventType: 'os_mismatch' });
  assert.equal(osOnly.length, 1);
  assert.equal(osOnly[0]?.confidence, 'medium');
});

test('InMemory 欄位定義：upsert 後可列出且覆寫', async () => {
  const repo = new InMemoryRiskRepository();
  await repo.upsertFieldDefinition(makeFieldDefinition());
  await repo.upsertFieldDefinition({
    ...makeFieldDefinition(),
    status: 'deprecated',
  });
  const list = await repo.listFieldDefinitions();
  assert.equal(list.length, 1);
  assert.equal(list[0]?.status, 'deprecated');
});

test('InMemory 設備指紋：upsert 累計 session/ip 並可依 hash 查詢', async () => {
  const repo = new InMemoryRiskRepository();
  const hash = 'fp-sha256-abc';
  await repo.upsertDeviceFingerprint({
    fingerprintHash: hash,
    canvasHash: 'canvas-1',
    webglHash: 'webgl-1',
    sessionCount: 1,
    ipCount: 1,
    lastSeen: '2026-08-03T20:10:17+08:00',
  });
  await repo.upsertDeviceFingerprint({
    fingerprintHash: hash,
    sessionCount: 1,
    ipCount: 2,
    lastSeen: '2026-09-01T08:00:00+08:00',
  });

  const found = await repo.getDeviceFingerprint(hash);
  assert.ok(found);
  assert.equal(found.sessionCount, 2);
  assert.equal(found.ipCount, 3);
  assert.equal(found.canvasHash, 'canvas-1');

  const list = await repo.listDeviceFingerprints();
  assert.equal(list.length, 1);
  assert.equal(list[0]?.lastSeen, '2026-09-01T08:00:00+08:00');
});

test('InMemory 網路訊號：upsert 後可取回結構化 open_ports/dns_leak', async () => {
  const repo = new InMemoryRiskRepository();
  await repo.upsertNetworkSignal({
    sessionId: 's-network',
    ipAddress: '49.214.1.196',
    isp: 'Taiwan Fixed Network',
    openPorts: [22, 3389],
    dnsLeakList: ['175.96.61.48'],
    geoConfidence: 'low',
  });
  const signal = await repo.getNetworkSignal('s-network');
  assert.ok(signal);
  assert.deepEqual(signal.openPorts, [22, 3389]);
  assert.deepEqual(signal.dnsLeakList, ['175.96.61.48']);
  assert.equal(signal.isp, 'Taiwan Fixed Network');
});

test('InMemory 審查流程：建立 case、更新 decision、建立 appeal', async () => {
  const repo = new InMemoryRiskRepository();
  const reviewCase = makeReviewCase();
  await repo.createReviewCase(reviewCase);

  const list = await repo.listReviewCases({ status: 'pending' });
  assert.equal(list.length, 1);
  assert.equal(list[0]?.caseId, reviewCase.caseId);

  const updated = await repo.updateReviewCase(reviewCase.caseId, {
    status: 'reviewed',
    decision: 'review',
    reviewerId: 'admin-sec',
    falsePositiveFlag: false,
    closedAt: new Date().toISOString(),
  });
  assert.ok(updated);
  assert.equal(updated.status, 'reviewed');
  assert.equal(updated.decision, 'review');

  await repo.createAppeal(makeAppeal(reviewCase.caseId));
  const afterAppeal = await repo.getReviewCase(reviewCase.caseId);
  assert.equal(afterAppeal?.appealStatus, 'pending');
});

test('PostgreSQL 風險層整合（執行期驗證）', { skip: !databaseUrl }, async () => {
  assert.ok(databaseUrl);
  const repo = new PostgresRiskRepository(databaseUrl);
  try {
    const event = makeRiskEvent();
    await repo.insertRiskEvent(event);
    const list = await repo.listRiskEvents({ sessionId: event.sessionId, severity: 'high' });
    assert.ok(list.some((item) => item.eventId === event.eventId));

    const definition = makeFieldDefinition();
    await repo.upsertFieldDefinition(definition);
    const fields = await repo.listFieldDefinitions();
    assert.ok(fields.some((field) => field.fieldPath === definition.fieldPath));

    await repo.upsertDeviceFingerprint({
      fingerprintHash: 'fp-ci-001',
      sessionCount: 1,
      ipCount: 1,
    });
    assert.ok(await repo.getDeviceFingerprint('fp-ci-001'));

    await repo.upsertNetworkSignal({
      sessionId: 'session-network-ci',
      openPorts: [22],
      dnsLeakList: ['175.96.61.48'],
    });
    assert.ok(await repo.getNetworkSignal('session-network-ci'));

    const reviewCase = makeReviewCase();
    await repo.createReviewCase(reviewCase);
    assert.ok(await repo.getReviewCase(reviewCase.caseId));
    await repo.createAppeal(makeAppeal(reviewCase.caseId));
  } finally {
    await repo.close();
  }
});
