#!/usr/bin/env node
/**
 * 對「執行中的 docker compose 堆疊」做冒煙測試（本機鏡像驗證用）。
 *
 * 前置：docker compose up -d --build 已啟動。
 * 用法：node scripts/smoke-compose.mjs
 */

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// 簽章函式內建於此（主機無需先編譯 packages）。
// 演算法與 packages/signing/src/index.ts 一致；若不一致，API 回傳
// verified=false 時本測試即會失敗，可即時發現兩邊不同步。
const encoder = new TextEncoder();

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(secret, text) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(text));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function signReport(report, secret) {
  const signalsHash = await sha256Hex(JSON.stringify(report.signals));
  const canonical = [
    report.reportId,
    report.sessionId,
    report.schemaVersion,
    report.createdAt,
    report.integrity.nonce,
    report.integrity.timestamp,
    signalsHash,
  ].join('|');
  return hmacSha256Hex(secret, canonical);
}

/** VPS 部署時 .env 與執行目錄同在 repo 根目錄，自動載入正式密鑰。 */
async function loadDotEnvIfPresent() {
  const file = join(process.cwd(), '.env');
  if (!existsSync(file)) return;
  const text = await readFile(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

await loadDotEnvIfPresent();

const API = process.env.API_URL ?? 'http://127.0.0.1:3001';
const WEB = process.env.WEB_URL ?? 'http://127.0.0.1:3000';
const SIGNING_SECRET = process.env.REPORT_SIGNING_SECRET ?? 'dev-only-change-me';
const results = [];

const record = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function waitHealthy(url, label, tries = 30) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}

const apiReady = await waitHealthy(`${API}/health`);
record('API /health 就緒', apiReady, API);
const webReady = await waitHealthy(`${WEB}/`);
record('網站 / 就緒', webReady, WEB);

// 1. 匿名報告（網站 standard/stored 上傳路徑）
const raw = await readFile('docs/examples/report.example.json', 'utf8');
const anonymous = JSON.parse(raw);
anonymous.reportId = randomUUID();
anonymous.sessionId = randomUUID();
anonymous.createdAt = new Date().toISOString();
anonymous.integrity.nonce = randomUUID();
anonymous.integrity.timestamp = new Date().toISOString();
anonymous.integrity.signature = '';

const r1 = await fetch(`${API}/v1/reports`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(anonymous),
});
const r1b = await r1.json();
record('匿名報告 201（網站路徑）', r1.status === 201 && typeof r1b.score?.finalScore === 'number', `score=${r1b.score?.finalScore}`);

// 2. 租戶 + 正式簽章報告
const reg = await fetch(`${API}/v1/tenants`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'Compose Smoke', email: 'smoke@shieldscan.dev', plan: 'developer' }),
});
const regBody = await reg.json();
record('租戶註冊 + API Key', reg.status === 201 && typeof regBody.apiKey === 'string');

const signed = JSON.parse(raw);
signed.reportId = randomUUID();
signed.sessionId = randomUUID();
signed.createdAt = new Date().toISOString();
signed.integrity.nonce = randomUUID();
signed.integrity.timestamp = new Date().toISOString();
signed.integrity.signature = '';
signed.integrity.signature = await signReport(signed, SIGNING_SECRET);

const r2 = await fetch(`${API}/v1/reports`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${regBody.apiKey}` },
  body: JSON.stringify(signed),
});
const r2b = await r2.json();
record(
  '租戶簽章報告 201 + verified',
  r2.status === 201 && r2b.integrity?.verified === true,
  `verified=${r2b.integrity?.verified}`,
);

// 3. PostgreSQL 落庫驗證（透過 API 讀回）
const stored = await fetch(`${API}/v1/reports/${signed.reportId}`, {
  headers: { authorization: `Bearer ${regBody.apiKey}` },
});
const storedBody = await stored.json();
record(
  '報告已落庫（clientIp/raw.network）',
  stored.status === 200 && storedBody.clientIp !== undefined && storedBody.raw?.network?.ip,
  `clientIp=${storedBody.clientIp}`,
);

// 4. Phase 1：欄位定義 + 風險事件（需 API Key）
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
  status: 'active',
  version: '1.0.0',
};
const fieldRes = await fetch(`${API}/v1/fields`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${regBody.apiKey}` },
  body: JSON.stringify(fieldDefinition),
});
record('欄位定義 upsert', fieldRes.status === 200);

const riskEvent = {
  eventId: randomUUID(),
  sessionId: signed.sessionId,
  reportId: signed.reportId,
  eventType: 'open_ports',
  severity: 'high',
  confidence: 'medium',
  evidenceJson: { openPorts: [22, 3389] },
  ruleId: 'rule.open_ports_mobile',
  ruleVersion: '1.0.0',
  reviewRequired: true,
  detectedAt: new Date().toISOString(),
  reviewStatus: 'pending',
};
const eventRes = await fetch(`${API}/v1/risk-events`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${regBody.apiKey}` },
  body: JSON.stringify(riskEvent),
});
record('風險事件寫入', eventRes.status === 201);

const eventListRes = await fetch(`${API}/v1/risk-events?sessionId=${encodeURIComponent(signed.sessionId)}`, {
  headers: { authorization: `Bearer ${regBody.apiKey}` },
});
const eventListBody = await eventListRes.json();
record(
  '風險事件可依 session 查詢',
  eventListRes.status === 200 && eventListBody.events?.some((item) => item.eventId === riskEvent.eventId),
);

const failed = results.filter((ok) => !ok).length;
console.log(`\n=== docker compose 冒煙：${results.length - failed}/${results.length} 通過 ===`);
process.exit(failed > 0 ? 1 : 0);
