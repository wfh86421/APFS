#!/usr/bin/env node
/**
 * 正式儲存（PostgreSQL + Redis）切換驗證。
 *
 * 模式：
 * 1. 本機（無 EXTERNAL_DB）：啟動內嵌 PostgreSQL/Redis → 以 DATABASE_URL 啟動 API → 驗證。
 * 2. CI / docker compose（EXTERNAL_DB=1）：使用既有 Postgres/Redis（例如
 *    docker compose up -d postgres redis），API 直接連 DATABASE_URL。
 *
 * 驗證內容：報告儲存/查詢/歷史/ipHistory、直接查 PostgreSQL 確認資料落庫、
 * Redis PING、P99、刪除（個資請求）。
 *
 * 用法：
 *   EXTERNAL_DB=1 DATABASE_URL=postgres://shieldscan:shieldscan@localhost:5432/shieldscan \
 *     node scripts/verify-prod-storage.mjs
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import pg from 'pg';
import { startDevDatabases } from './dev-db.mjs';

const API_URL = 'http://127.0.0.1:3001';
const VISITOR = 'visitor-prod-storage';
const EXTERNAL_DB = process.env.EXTERNAL_DB === '1';
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://shieldscan:shieldscan@127.0.0.1:5432/shieldscan';
const REDIS_HOST = process.env.REDIS_HOST ?? '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6379);
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function redisPing(host = REDIS_HOST, port = REDIS_PORT) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, host);
    const timer = setTimeout(() => reject(new Error('Redis PING timeout')), 3000);
    socket.once('connect', () => socket.write('*1\r\n$4\r\nPING\r\n'));
    socket.once('data', (data) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(data.toString().includes('PONG'));
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function postReport(ip) {
  const raw = await readFile('docs/examples/report.example.json', 'utf8');
  const report = JSON.parse(raw);
  report.reportId = randomUUID();
  report.sessionId = randomUUID();
  report.subjectId = VISITOR;
  report.createdAt = new Date().toISOString();
  report.integrity.nonce = randomUUID();
  report.integrity.timestamp = new Date().toISOString();
  // 匿名上報（網站路徑）：不帶簽章，避免在 REPORT_SIGNING_SECRET 已設定時被誤判。
  report.integrity.signature = '';
  const res = await fetch(`${API_URL}/v1/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify(report),
  });
  return { status: res.status, report };
}

async function countScans() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(
      'SELECT count(*)::int AS n FROM fingerprint_scans WHERE visitor_id = $1',
      [VISITOR],
    );
    return rows[0]?.n ?? -1;
  } finally {
    await client.end();
  }
}

async function apiReachable() {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

let dbs;
let api;
const reuseApi = !EXTERNAL_DB && (await apiReachable());
if (!EXTERNAL_DB && !reuseApi) {
  console.log('[verify] 啟動內嵌 PostgreSQL/Redis…');
  dbs = await startDevDatabases();
}
if (!reuseApi) {
  console.log('[verify] 以 DATABASE_URL 啟動 API…');
  api = spawn(process.execPath, ['apps/api/dist/server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL, PORT: '3001' },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
} else {
  console.log('[verify] 偵測到 API 已在運行，直接複用（compose 堆疊模式）…');
}

try {
  let healthy = false;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${API_URL}/health`);
      if (res.ok) {
        healthy = true;
        break;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(healthy, 'API 未在時限內就緒');
  record(
    'API 就緒（/health）',
    true,
    EXTERNAL_DB ? `外部 Postgres（${DATABASE_URL.split('@')[1]}）` : '內嵌 Postgres',
  );

  const pong = await redisPing();
  record('Redis PING → PONG', pong, `${REDIS_HOST}:${REDIS_PORT}`);

  // Phase 3 租戶流程：自助註冊拿 API Key（讀取/刪除需授權）。
  const reg = await fetch(`${API_URL}/v1/tenants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Verify Bot', email: 'verify@shieldscan.dev', plan: 'developer' }),
  });
  const regBody = (await reg.json()) ?? {};
  const apiKey = regBody.apiKey;
  record('POST /v1/tenants（自助註冊 + API Key）', reg.status === 201 && typeof apiKey === 'string');

  const authFetch = (url, init = {}) =>
    fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${apiKey}` },
    });

  const a = await postReport('49.214.1.196');
  const b = await postReport('203.0.113.10');
  record('POST /v1/reports 201 × 2', a.status === 201 && b.status === 201);

  const storedA = await (await authFetch(`${API_URL}/v1/reports/${a.report.reportId}`)).json();
  const storedB = await (await authFetch(`${API_URL}/v1/reports/${b.report.reportId}`)).json();
  record(
    'GET /v1/reports/:id（clientIp 記錄）',
    storedA.clientIp === '49.214.1.196' && storedB.clientIp === '203.0.113.10',
    `A=${storedA.clientIp}, B=${storedB.clientIp}`,
  );
  record(
    'server.httpHeaders 訊號已儲存',
    storedA.signals.some((s) => s.pluginId === 'server.httpHeaders'),
    `signals=${storedA.signals.length}`,
  );

  const dbCount = await countScans();
  record('直接查 PostgreSQL：該訪客 2 筆落庫', dbCount === 2, `count=${dbCount}`);

  const history = await (await authFetch(`${API_URL}/v1/visitors/${VISITOR}/reports`)).json();
  record(
    '同 visitor 跨 IP 歷史',
    history.reports.length === 2 &&
      new Set(history.reports.map((r) => r.clientIp)).size === 2,
    `reports=${history.reports.length}, IPs=${history.reports.map((r) => r.clientIp).join(',')}`,
  );
  record(
    'visitor ipHistory 累積',
    history.visitor?.ipHistory?.length === 2,
    `ipHistory=${history.visitor?.ipHistory?.length}`,
  );

  const latencies = [];
  for (let i = 0; i < 20; i++) {
    let t = performance.now();
    await authFetch(`${API_URL}/v1/reports/${a.report.reportId}`);
    latencies.push(performance.now() - t);
    t = performance.now();
    await fetch(`${API_URL}/v1/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report: a.report }),
    });
    latencies.push(performance.now() - t);
  }
  const sorted = [...latencies].sort((x, y) => x - y);
  const p99 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.99) - 1)] ?? 0;
  record('P99 < 500ms', p99 < 500, `P99=${p99.toFixed(1)}ms, n=${latencies.length}`);

  const del = await authFetch(`${API_URL}/v1/reports/${b.report.reportId}`, { method: 'DELETE' });
  const gone = await authFetch(`${API_URL}/v1/reports/${b.report.reportId}`);
  record('DELETE /v1/reports/:id', del.status === 204 && gone.status === 404);

  const delVisitor = await authFetch(`${API_URL}/v1/visitors/${VISITOR}`, { method: 'DELETE' });
  const historyAfter = await (await authFetch(`${API_URL}/v1/visitors/${VISITOR}/reports`)).json();
  record(
    'DELETE /v1/visitors/:id（被遺忘權）',
    delVisitor.status === 204 && historyAfter.reports.length === 0,
    `剩餘報告=${historyAfter.reports.length}`,
  );
  const dbCountAfter = await countScans();
  record('直接查 PostgreSQL：該訪客刪除後 = 0 筆', dbCountAfter === 0, `count=${dbCountAfter}`);
} finally {
  if (api) api.kill();
  if (dbs) await dbs.stop().catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n=== 正式儲存切換驗證（${EXTERNAL_DB ? '外部 docker compose' : '內嵌'}）：${results.length - failed.length}/${results.length} 通過 ===`,
);
process.exitCode = failed.length > 0 ? 1 : 0;
