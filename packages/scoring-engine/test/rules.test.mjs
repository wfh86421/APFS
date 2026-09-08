// WP1 規則引擎單元測試（純 JS：不需要 TS 測試基建，避免 lockfile 變動）。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zRiskEventType } from '@shieldscan/core-schema';
import { ScoringEngine, defaultRules, RULE_EVENT_TYPE } from '../dist/index.js';

function makeReport({ signals = [], issues = [] } = {}) {
  return {
    reportId: crypto.randomUUID(),
    schemaVersion: '0.1.0',
    sessionId: crypto.randomUUID(),
    source: 'web',
    createdAt: new Date().toISOString(),
    consent: { mode: 'standard', retentionDays: 90 },
    sdk: { name: '@shieldscan/browser-sdk', version: '0.1.0', platform: 'browser' },
    signals,
    issues,
    scores: { privacyExposure: 80, authenticity: 80, automationRisk: 20, networkTrust: 80 },
    integrity: { signature: '', nonce: 'n', timestamp: new Date().toISOString(), sdkVersion: '0.1.0' },
  };
}

function calc(report, issues) {
  const engine = new ScoringEngine();
  for (const rule of defaultRules()) engine.registerRule(rule);
  return engine.calculate(report, issues, {
    profileId: 'privacy-default',
    weights: { privacyExposure: 100, authenticity: 100, automationRisk: 100, networkTrust: 100 },
    thresholds: { allow: 70, review: 60, challenge: 50, block: 30 },
  });
}

function signal(key, value) {
  return {
    id: crypto.randomUUID(),
    pluginId: 'browser.test',
    pluginVersion: '0.1.0',
    platform: 'browser',
    category: 'hardware',
    key,
    value,
    confidence: 0.95,
    collectedAt: new Date().toISOString(),
  };
}

function issue(type, evidence = {}) {
  return { id: crypto.randomUUID(), type, severity: 'medium', description: type, evidence };
}

test('canvas_tamper：以 signals key=canvas value.isTampered=true 觸發', async () => {
  const score = await calc(makeReport({ signals: [signal('canvas', { isTampered: true })] }), []);
  assert.ok(score.explanations.some((e) => e.ruleId === 'canvas_tamper'));
  assert.equal(score.finalScore, 95); // 100 - 5
});

test('canvas_tamper：以 issue type=canvas_tampered 觸發', async () => {
  const score = await calc(makeReport(), [issue('canvas_tampered')]);
  assert.ok(score.explanations.some((e) => e.ruleId === 'canvas_tamper'));
});

test('webrtc_leak：以 producer 型別 webrtc_local_ip 觸發（修復斷鏈）', async () => {
  const score = await calc(makeReport(), [issue('webrtc_local_ip')]);
  assert.ok(score.explanations.some((e) => e.ruleId === 'webrtc_leak'));
  assert.equal(score.finalScore, 92);
});

test('webrtc_leak：server 型別 server_webrtc_leak 亦觸發', async () => {
  const score = await calc(makeReport(), [issue('server_webrtc_leak', { publicIp: '1.2.3.4' })]);
  assert.ok(score.explanations.some((e) => e.ruleId === 'webrtc_leak'));
});

test('dns_leak：server 型別 server_dns_leak 觸發', async () => {
  const score = await calc(makeReport(), [issue('server_dns_leak', { dnsServers: ['8.8.8.8'] })]);
  assert.ok(score.explanations.some((e) => e.ruleId === 'dns_leak'));
});

test('伺服器事實規則：datacenter / tor / vpn / proxy 各自觸發且雙軌在 fraud', async () => {
  const dc = await calc(makeReport(), [issue('server_datacenter_ip')]);
  const t = await calc(makeReport(), [issue('server_tor_ip')]);
  const v = await calc(makeReport(), [issue('server_vpn_detected')]);
  const p = await calc(makeReport(), [issue('server_proxy_detected')]);
  assert.ok(dc.explanations.some((e) => e.ruleId === 'server_datacenter_ip' && e.track === 'fraud'));
  assert.ok(t.explanations.some((e) => e.ruleId === 'server_tor_ip' && e.track === 'fraud'));
  assert.ok(v.explanations.some((e) => e.ruleId === 'server_vpn_detected' && e.track === 'fraud'));
  assert.ok(p.explanations.some((e) => e.ruleId === 'server_proxy_detected' && e.track === 'fraud'));
  assert.equal(dc.finalScore, 92);
  assert.equal(t.finalScore, 85);
});

test('乾淨環境：無任何規則觸發 → 100 分、無 explanations', async () => {
  const score = await calc(makeReport(), []);
  assert.equal(score.finalScore, 100);
  assert.equal(score.explanations.length, 0);
  assert.equal(score.riskLevel, 'low');
});

test('伺服器事實規則：IP 速度異常 server_ip_velocity_anomaly 觸發且 track=fraud', async () => {
  const score = await calc(makeReport(), [
    issue('server_ip_velocity_anomaly', { ipCount7d: 9, ips: ['1.1.1.1', '2.2.2.2'] }),
  ]);
  assert.ok(score.explanations.some((e) => e.ruleId === 'server_ip_velocity' && e.track === 'fraud'));
  assert.equal(score.finalScore, 92); // 100 - 8
});

test('WP4 規則：server_bot_suspected 觸發 bot_detected（-20）', async () => {
  const score = await calc(makeReport(), [issue('server_bot_suspected', { userAgent: 'curl/8' })]);
  assert.ok(score.explanations.some((e) => e.ruleId === 'bot_detected' && e.track === 'fraud'));
  assert.equal(score.finalScore, 80);
});

test('WP4 規則：server_header_incoherence 觸發（-6、fraud）', async () => {
  const score = await calc(makeReport(), [
    issue('server_header_incoherence', { uaOs: 'Windows', clientHintsPlatform: 'macOS' }),
  ]);
  assert.ok(
    score.explanations.some((e) => e.ruleId === 'server_header_incoherence' && e.track === 'fraud'),
  );
  assert.equal(score.finalScore, 94);
});

test('W4 規則：unusual_open_ports 觸發 open_ports_ssh_rdp（-15、fraud、critical）', async () => {
  const score = await calc(makeReport(), [
    issue('unusual_open_ports', { openPorts: [22, 3389] }),
  ]);
  const exp = score.explanations.find((e) => e.ruleId === 'open_ports_ssh_rdp');
  assert.ok(exp, 'open_ports_ssh_rdp 應觸發');
  assert.equal(exp.track, 'fraud');
  assert.equal(exp.severity, 'critical');
  assert.equal(score.finalScore, 85); // 100 - 15
});

test('W4 規則：os_mismatch 觸發（-5、fraud）', async () => {
  const score = await calc(makeReport(), [
    issue('os_mismatch', { uaOs: 'Windows', clientHintsPlatform: 'macOS' }),
  ]);
  const exp = score.explanations.find((e) => e.ruleId === 'os_mismatch');
  assert.ok(exp, 'os_mismatch 應觸發');
  assert.equal(exp.track, 'fraud');
  assert.equal(score.finalScore, 95); // 100 - 5
});

test('W4.1 環境一致性規則：timezone/language/webrtc_ip_mismatch/canvas_disabled 各自點火', async () => {
  const cases = [
    ['timezone_mismatch', 92], // -8
    ['language_mismatch', 94], // -6
    ['webrtc_ip_mismatch', 92], // -8
    ['canvas_disabled', 95], // -5（隱私軌）
  ];
  for (const [type, expected] of cases) {
    const score = await calc(makeReport(), [issue(type)]);
    const exp = score.explanations.find((e) => e.ruleId === type);
    assert.ok(exp, `${type} 規則應觸發`);
    assert.equal(score.finalScore, expected);
  }
});

test('W4.1 對照完整性：每個 defaultRules id 皆有 RULE_EVENT_TYPE key 且值為合法 zRiskEventType', () => {
  const rules = defaultRules();
  const ids = rules.map((r) => r.id);
  const mapKeys = Object.keys(RULE_EVENT_TYPE);
  assert.ok(ids.length >= 16, 'defaultRules 至少 16 條');
  for (const id of ids) {
    assert.ok(mapKeys.includes(id), `RULE_EVENT_TYPE 缺少 key: ${id}`);
    const parsed = zRiskEventType.safeParse(RULE_EVENT_TYPE[id]);
    assert.ok(parsed.success, `非法 eventType: ${id} -> ${RULE_EVENT_TYPE[id]}`);
  }
  assert.deepEqual(
    [...mapKeys].sort(),
    [...new Set(ids)].sort(),
    'RULE_EVENT_TYPE keys 應與 defaultRules ids 一對一（防漏 key／誤落 fingerprint_instability 收容桶）',
  );
});
