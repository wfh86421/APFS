#!/usr/bin/env node
/**
 * core-schema 契約驗證（需先執行 pnpm --filter @shieldscan/core-schema build）。
 * 用法：node scripts/verify-core-schema.mjs
 */

import assert from 'node:assert/strict';
import {
  validateFieldDefinition,
  validateNormalizedSignal,
  validateRiskEvent,
  validateSignalEvidence,
} from '../packages/core-schema/dist/index.js';

// RiskEvent 正例
const riskEvent = {
  eventId: 'evt_open_ports_001',
  tenantId: 'tenant_x',
  sessionId: 'session_001',
  reportId: 'report_001',
  eventType: 'open_ports',
  severity: 'high',
  confidence: 'medium',
  evidenceJson: { openPorts: [22, 3389], requiresReview: true },
  ruleId: 'rule.open_ports_mobile',
  ruleVersion: '1.0.0',
  scoreImpact: -15,
  autoAction: 'review',
  reviewRequired: true,
  detectedAt: '2026-08-03T20:10:17+08:00',
  reviewStatus: 'pending',
};
assert.equal(validateRiskEvent(riskEvent).ok, true, 'RiskEvent 正例應通過');

// RiskEvent 反例：非法 severity
assert.equal(
  validateRiskEvent({ ...riskEvent, severity: 'extreme' }).ok,
  false,
  '非法 severity 應被拒絕',
);

// FieldDefinition 正例／反例
const fieldDefinition = {
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
  status: 'experimental',
  version: '1.0.0',
};
assert.equal(validateFieldDefinition(fieldDefinition).ok, true, 'FieldDefinition 正例應通過');
assert.equal(
  validateFieldDefinition({ ...fieldDefinition, status: 'disabled' }).ok,
  false,
  '非法 field status 應被拒絕',
);

// SignalEvidence 正例
const evidence = {
  source: 'browser_sdk',
  method: 'canvas_hash',
  confidence: 'medium',
  sensitivity: 'high',
  collectedAt: '2026-08-03T20:10:17+08:00',
  schemaVersion: '1.4.0',
  rawReference: 'raw.signals.canvas',
  policy: {
    accessRoles: ['security_admin'],
    retentionClass: 'policy',
  },
};
assert.equal(validateSignalEvidence(evidence).ok, true, 'SignalEvidence 正例應通過');

// NormalizedSignal 加選填 evidence / sensitivity 仍可驗證
const signal = {
  id: 'sig-canvas-1',
  pluginId: 'browser.canvas',
  pluginVersion: '0.1.0',
  platform: 'browser',
  category: 'hardware',
  key: 'canvas',
  value: { supported: true },
  hash: '1bf213f7',
  confidence: 0.95,
  collectedAt: '2026-08-03T20:10:16+08:00',
  sensitivity: 'high',
  evidence,
};
assert.equal(validateNormalizedSignal(signal).ok, true, '含 evidence 的訊號應通過');

// 既有訊號（無新欄位）仍通過：向後相容
const legacySignal = { ...signal };
delete legacySignal.sensitivity;
delete legacySignal.evidence;
assert.equal(validateNormalizedSignal(legacySignal).ok, true, '舊格式訊號應向後相容');

console.log('✔ core-schema contracts verified (risk event / field definition / evidence / signal)');
