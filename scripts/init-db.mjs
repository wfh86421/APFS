#!/usr/bin/env node
/**
 * 對外部 PostgreSQL 套用 schema（供 CI/docker compose 場景使用）。
 *
 * 用法：
 *   DATABASE_URL=postgres://shieldscan:shieldscan@localhost:5432/shieldscan \
 *     node scripts/init-db.mjs
 */

import { readFile } from 'node:fs/promises';
import pg from 'pg';

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://shieldscan:shieldscan@127.0.0.1:5432/shieldscan';
const initSql = process.env.INIT_SQL ?? 'infra/docker/postgres/init.sql';

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  const sql = await readFile(initSql, 'utf8');
  await client.query(sql);
  console.log(`[init-db] schema 已套用（${initSql}）`);
} finally {
  await client.end();
}
