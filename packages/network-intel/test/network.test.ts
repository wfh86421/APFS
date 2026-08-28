import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  analyzeIp,
  analyzeNetwork,
  detectDnsLeak,
  MockGeoIpProvider,
  NETWORK_SAMPLES,
  webrtcConsistency,
} from '@shieldscan/network-intel';

test('網路樣本分類準確率 ≥ 95%', async () => {
  const provider = new MockGeoIpProvider();
  let correct = 0;

  for (const sample of NETWORK_SAMPLES) {
    const analysis = await analyzeIp(sample.ip, provider);
    const ok =
      analysis.proxy === sample.expected.proxy &&
      analysis.vpn === sample.expected.vpn &&
      analysis.tor === sample.expected.tor &&
      analysis.datacenter === sample.expected.datacenter;
    if (ok) correct += 1;
  }

  const accuracy = correct / NETWORK_SAMPLES.length;
  assert.ok(
    accuracy >= 0.95,
    `準確率 ${(accuracy * 100).toFixed(1)}% 低於 95%`,
  );
});

test('WebRTC 一致性：一致 / 洩漏 / 未知', () => {
  assert.equal(
    webrtcConsistency(['192.168.1.5', '49.214.1.196'], '49.214.1.196'),
    'consistent',
  );
  assert.equal(webrtcConsistency(['49.214.1.196', '8.8.8.8'], '49.214.1.196'), 'leak');
  assert.equal(webrtcConsistency(['192.168.1.5'], '49.214.1.196'), 'unknown');
});

test('DNS leak：ISP 不一致時偵測', () => {
  const leak = detectDnsLeak(['175.96.61.48'], 'Chunghwa Telecom', 'Taiwan Fixed Network');
  assert.equal(leak.detected, true);
  const clean = detectDnsLeak(['168.95.1.1'], 'Chunghwa Telecom', 'Chunghwa Telecom');
  assert.equal(clean.detected, false);
});

test('風險等級：Tor > 高風險 > 中風險 > 低風險', () => {
  const torSample = NETWORK_SAMPLES.find((s) => s.ip === '185.220.101.34');
  const vpnSample = NETWORK_SAMPLES.find((s) => s.ip === '45.155.204.5');
  const dcSample = NETWORK_SAMPLES.find((s) => s.ip === '34.120.35.1');
  const normalSample = NETWORK_SAMPLES.find((s) => s.ip === '49.214.1.196');
  assert.ok(torSample && vpnSample && dcSample && normalSample);

  const tor = analyzeNetwork('185.220.101.34', torSample.geo);
  assert.equal(tor.riskLevel, 'critical');
  const vpn = analyzeNetwork('45.155.204.5', vpnSample.geo);
  assert.equal(vpn.riskLevel, 'high');
  const dc = analyzeNetwork('34.120.35.1', dcSample.geo);
  assert.equal(dc.riskLevel, 'medium');
  const normal = analyzeNetwork('49.214.1.196', normalSample.geo);
  assert.equal(normal.riskLevel, 'low');
});
