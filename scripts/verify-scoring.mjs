#!/usr/bin/env node
/**
 * 雙軌可解釋評分驗證（需先執行 packages 編譯）。
 * 用法：node scripts/verify-scoring.mjs
 */

import assert from 'node:assert/strict';
import { defaultRules, ScoringEngine } from '../packages/scoring-engine/dist/index.js';

const now = new Date().toISOString();
const report = {
  reportId: 'report-score-verify',
  schemaVersion: '0.1.0',
  sessionId: 'session-score-verify',
  source: 'web',
  createdAt: now,
  consent: { mode: 'standard' },
  sdk: { name: '@shieldscan/browser-sdk', version: '0.1.0', platform: 'browser' },
  signals: [],
  issues: [
    { id: 'i-canvas', type: 'canvas_tampered', severity: 'low', description: 'Canvas 防追蹤', evidence: {} },
    { id: 'i-os', type: 'os_mismatch', severity: 'high', description: 'OS 衝突', evidence: {} },
  ],
  scores: {
    privacyExposure: 0,
    authenticity: 0,
    automationRisk: 0,
    networkTrust: 0,
  },
  integrity: { signature: '', nonce: 'n', timestamp: now, sdkVersion: '0.1.0' },
};

const profile = {
  profileId: 'privacy-default',
  weights: {},
  thresholds: { allow: 70, review: 60, challenge: 50, block: 30 },
};

const engine = new ScoringEngine();
for (const rule of defaultRules()) engine.registerRule(rule);

const result = await engine.calculate(report, report.issues, profile);
assert.equal(result.finalScore, 90);
assert.equal(result.privacyScore, 95, 'Canvas 隱私防禦只應扣隱私軌');
assert.equal(result.fraudScore, 95, 'OS 衝突只應扣欺詐軌');
assert.equal(result.privacyDeductions.length, 1);
assert.equal(result.fraudDeductions.length, 1);
assert.equal(result.explanations.length, 2);
assert.ok(result.explanations.every((factor) => factor.reason.length > 0));

console.log('✔ scoring verified (dual-track privacy/fraud + explanations)');
