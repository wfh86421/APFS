import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FieldDefinition, RiskEvent } from '@shieldscan/core-schema';
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
  } finally {
    await repo.close();
  }
});
