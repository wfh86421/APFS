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

/**
 * risk 表 tenant_id 皆為 UUID 型別：測試 tenant 一律用合法 UUID，
 * 否則真實 Postgres（CI/本機 docker）會回 22P02 invalid input syntax for type uuid。
 */
const RISK_TENANT_ID = '40000000-0000-4000-8000-000000000001';

function makeRiskEvent(overrides: Partial<RiskEvent> = {}): RiskEvent {
  return {
    eventId: crypto.randomUUID(),
    tenantId: RISK_TENANT_ID,
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
    tenantId: RISK_TENANT_ID,
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

  const bySession = await repo.listRiskEvents(RISK_TENANT_ID, { sessionId: 's1' });
  assert.equal(bySession.length, 2);

  const highOnly = await repo.listRiskEvents(RISK_TENANT_ID, { severity: 'high' });
  assert.equal(highOnly.length, 1);

  const osOnly = await repo.listRiskEvents(RISK_TENANT_ID, { eventType: 'os_mismatch' });
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
    tenantId: RISK_TENANT_ID,
    canvasHash: 'canvas-1',
    webglHash: 'webgl-1',
    sessionCount: 1,
    ipCount: 1,
    lastSeen: '2026-08-03T20:10:17+08:00',
  });
  await repo.upsertDeviceFingerprint({
    fingerprintHash: hash,
    tenantId: RISK_TENANT_ID,
    sessionCount: 1,
    ipCount: 2,
    lastSeen: '2026-09-01T08:00:00+08:00',
  });

  const found = await repo.getDeviceFingerprint(hash);
  assert.ok(found);
  assert.equal(found.sessionCount, 2);
  assert.equal(found.ipCount, 3);
  assert.equal(found.canvasHash, 'canvas-1');

  const list = await repo.listDeviceFingerprints(RISK_TENANT_ID);
  assert.equal(list.length, 1);
  assert.equal(list[0]?.lastSeen, '2026-09-01T08:00:00+08:00');
});

test('InMemory 網路訊號：upsert 後可取回結構化 open_ports/dns_leak', async () => {
  const repo = new InMemoryRiskRepository();
  await repo.upsertNetworkSignal({
    sessionId: 's-network',
    tenantId: RISK_TENANT_ID,
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

  const list = await repo.listReviewCases(RISK_TENANT_ID, { status: 'pending' });
  assert.equal(list.length, 1);
  assert.equal(list[0]?.caseId, reviewCase.caseId);

  const updated = await repo.updateReviewCase(RISK_TENANT_ID, reviewCase.caseId, {
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
  const afterAppeal = await repo.getReviewCase(RISK_TENANT_ID, reviewCase.caseId);
  assert.equal(afterAppeal?.appealStatus, 'pending');
});

test('InMemory 審計日誌：append 後依時間倒序回傳', async () => {
  const repo = new InMemoryRiskRepository();
  await repo.appendAuditLog({ action: 'report-delete', tenantId: RISK_TENANT_ID, targetIp: '49.214.1.196', metadata: { reportId: 'r1' } });
  await repo.appendAuditLog({ action: 'review-decision', tenantId: RISK_TENANT_ID, metadata: { caseId: 'c1' } });
  const logs = await repo.listAuditLogs(RISK_TENANT_ID);
  assert.equal(logs.length, 2);
  assert.equal(logs[0]?.action, 'review-decision');
});

test('InMemory IP reputation：upsert 後可取回', async () => {
  const repo = new InMemoryRiskRepository();
  await repo.upsertIpReputation({
    ipRange: '49.214.1.196',
    reputationScore: 100,
    categories: ['clean'],
    source: 'test',
  });
  const reputation = await repo.getIpReputation('49.214.1.196');
  assert.ok(reputation);
  assert.equal(reputation.reputationScore, 100);
  assert.equal(reputation.categories[0], 'clean');
});

test('InMemory 成效回饋：recordOutcome 後 listOutcomes 依租戶/時窗過濾', async () => {
  const repo = new InMemoryRiskRepository();
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
  await repo.recordOutcome({
    id: crypto.randomUUID(),
    tenantId: RISK_TENANT_ID,
    sessionId: 's-out-1',
    outcomeType: 'fraud_chargeback',
    decision: 'block',
    shadow: false,
    amount: 1200,
    occurredAt: now,
  });
  await repo.recordOutcome({
    id: crypto.randomUUID(),
    tenantId: RISK_TENANT_ID,
    sessionId: 's-out-2',
    outcomeType: 'decision_log',
    decision: 'block',
    shadow: true,
    occurredAt: now,
  });
  await repo.recordOutcome({
    id: crypto.randomUUID(),
    tenantId: '99999999-9999-4999-8999-999999999999',
    outcomeType: 'fraud_order',
    occurredAt: now,
  });
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const list = await repo.listOutcomes(RISK_TENANT_ID, since30);
  assert.equal(list.length, 2);
  assert.deepEqual(
    list.map((e) => e.outcomeType).sort(),
    ['decision_log', 'fraud_chargeback'],
  );
  assert.ok(list.every((e) => e.tenantId === RISK_TENANT_ID));
  const empty = await repo.listOutcomes(RISK_TENANT_ID, old, old);
  assert.equal(empty.length, 0);
});

test('InMemory Phase A 版面：upsert 排序/讀取/還原，租戶隔離', async () => {
  const repo = new InMemoryRiskRepository();
  const otherTenant = '50000000-0000-4000-8000-000000000001';
  await repo.upsertDashboardBlock(RISK_TENANT_ID, {
    blockKey: 'overview.trend.week',
    enabled: false,
    position: 2,
    settings: { title: '近 30 天趨勢', days: 30, metric: '掃描量' },
  });
  await repo.upsertDashboardBlock(RISK_TENANT_ID, {
    blockKey: 'overview.kpi.summary',
    enabled: true,
    position: 0,
    settings: { title: '營運總覽', showCards: ['評分'] },
  });
  // 其他租戶不受影響
  await repo.upsertDashboardBlock(otherTenant, {
    blockKey: 'overview.kpi.summary',
    enabled: true,
    position: 0,
    settings: { title: 'X' },
  });

  const list = await repo.listDashboardBlocks(RISK_TENANT_ID);
  assert.equal(list.length, 2);
  assert.equal(list[0]?.blockKey, 'overview.kpi.summary');
  assert.equal(list[1]?.blockKey, 'overview.trend.week');
  assert.equal(list[1]?.enabled, false);

  await repo.resetDashboardBlock(RISK_TENANT_ID, 'overview.trend.week');
  const after = await repo.listDashboardBlocks(RISK_TENANT_ID);
  assert.equal(after.length, 1);
  assert.equal(after[0]?.blockKey, 'overview.kpi.summary');
  // 其他租戶的覆寫仍在
  assert.equal((await repo.listDashboardBlocks(otherTenant)).length, 1);
});

test('PostgreSQL 風險層整合（執行期驗證）', { skip: !databaseUrl }, async () => {
  assert.ok(databaseUrl);
  const repo = new PostgresRiskRepository(databaseUrl);
  try {
    const event = makeRiskEvent();
    await repo.insertRiskEvent(event);
    const list = await repo.listRiskEvents(RISK_TENANT_ID, { sessionId: event.sessionId, severity: 'high' });
    assert.ok(list.some((item) => item.eventId === event.eventId));

    const definition = makeFieldDefinition();
    await repo.upsertFieldDefinition(definition);
    const fields = await repo.listFieldDefinitions();
    assert.ok(fields.some((field) => field.fieldPath === definition.fieldPath));

    await repo.upsertDeviceFingerprint({
      fingerprintHash: 'fp-ci-001',
      tenantId: RISK_TENANT_ID,
      sessionCount: 1,
      ipCount: 1,
    });
    assert.ok(await repo.getDeviceFingerprint('fp-ci-001'));

    await repo.upsertNetworkSignal({
      sessionId: 'session-network-ci',
      tenantId: RISK_TENANT_ID,
      openPorts: [22],
      dnsLeakList: ['175.96.61.48'],
    });
    assert.ok(await repo.getNetworkSignal('session-network-ci'));

    const reviewCase = makeReviewCase();
    await repo.createReviewCase(reviewCase);
    assert.ok(await repo.getReviewCase(RISK_TENANT_ID, reviewCase.caseId));
    await repo.createAppeal(makeAppeal(reviewCase.caseId));
    await repo.appendAuditLog({ action: 'review-decision', tenantId: RISK_TENANT_ID, metadata: { caseId: reviewCase.caseId } });
    assert.ok((await repo.listAuditLogs(RISK_TENANT_ID)).length >= 1);

    const outcomeId = crypto.randomUUID();
    await repo.recordOutcome({
      id: outcomeId,
      tenantId: RISK_TENANT_ID,
      caseId: reviewCase.caseId,
      outcomeType: 'false_positive',
      decision: 'block',
      shadow: false,
      amount: 0,
      occurredAt: new Date().toISOString(),
    });
    assert.ok(
      (await repo.listOutcomes(RISK_TENANT_ID)).some((o) => o.id === outcomeId && o.outcomeType === 'false_positive'),
    );

    // Phase A 版面：dashboard_blocks upsert / list / reset（PG 執行期）
    await repo.upsertDashboardBlock(RISK_TENANT_ID, {
      blockKey: 'devices.table.list',
      enabled: true,
      position: 3,
      settings: { title: '設備（CI）', pageSize: 25, revealHash: true },
      updatedBy: 'ci-run',
    });
    const dbs = await repo.listDashboardBlocks(RISK_TENANT_ID);
    const block = dbs.find((b) => b.blockKey === 'devices.table.list');
    assert.ok(block);
    assert.equal(block?.enabled, true);
    assert.equal(block?.position, 3);
    assert.equal(block?.settings.title, '設備（CI）');
    await repo.resetDashboardBlock(RISK_TENANT_ID, 'devices.table.list');
    assert.equal(
      (await repo.listDashboardBlocks(RISK_TENANT_ID)).some((b) => b.blockKey === 'devices.table.list'),
      false,
    );
  } finally {
    await repo.close();
  }
});
