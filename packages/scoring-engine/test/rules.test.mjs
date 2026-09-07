// WP1 規則引擎單元測試（純 JS：不需要 TS 測試基建，避免 lockfile 變動）。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ScoringEngine, defaultRules } from '../dist/index.js';

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
