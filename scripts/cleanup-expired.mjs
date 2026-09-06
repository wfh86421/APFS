#!/usr/bin/env node
/**
 * 保留期清理（code review P1）：刪除已過期的 fingerprint_scans。
 *
 * 用法：
 *   DATABASE_URL=postgres://shieldscan:shieldscan@localhost:5432/shieldscan \
 *     node scripts/cleanup-expired.mjs
 *
 * 與 server 內建排程（startExpiryCleanup）互補：此腳本可放 cron 執行，
 * 冪等、可重跑（僅刪 expires_at < now() 的列）。
 */

import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[cleanup-expired] 需要 DATABASE_URL');
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  const result = await client.query(
    `DELETE FROM fingerprint_scans WHERE expires_at IS NOT NULL AND expires_at < now()`,
  );
  console.log(`[cleanup-expired] 已清理 ${result.rowCount ?? 0} 筆過期報告`);
} finally {
  await client.end();
}
