#!/usr/bin/env node
/**
 * 本機開發資料庫啟動器（Docker 不可用時的替代）。
 *
 * 啟動：
 * - PostgreSQL（embedded-postgres 內嵌二進位，port 5432，db/user/password = shieldscan）
 * - Redis（redis-memory-server；Windows 環境綁定失敗時自動改用內建 Memurai 二進位）
 *
 * 用法：
 *   node scripts/dev-db.mjs          啟動並保持執行（Ctrl+C 停止）
 *   node scripts/dev-db.mjs --once   啟動 → 停止（供 CI/腳本用）
 *
 * 已知限制：Windows 沙箱環境下 PostgreSQL initdb 無法建立 restricted token，
 * 請改用 docker compose（infra/docker/docker-compose.yml）或 CI。
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { RedisMemoryServer } from 'redis-memory-server';

const PG_PORT = Number(process.env.PG_PORT ?? 5432);
const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6379);
const PG_USER = process.env.PG_USER ?? 'shieldscan';
const PG_PASSWORD = process.env.PG_PASSWORD ?? 'shieldscan';
const PG_DB = process.env.PG_DB ?? 'shieldscan';
// 資料目錄必須為純 ASCII 路徑：Postgres 在 C locale 下會以系統 ANSI codepage
// 解讀含中文的路徑（例如本專案資料夾「歸檔」），導致 initdb 失敗。
const DATA_DIR = process.env.DEV_DB_DIR ?? join(tmpdir(), 'shieldscan-devdata', 'pg');
const INIT_SQL = process.env.INIT_SQL ?? 'infra/docker/postgres/init.sql';

function pingRedis(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
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

async function startPostgres() {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: PG_USER,
    password: PG_PASSWORD,
    port: PG_PORT,
    persistent: true,
    // 系統 locale 為 Big5（Chinese (Traditional)_Taiwan.950）時 initdb 會失敗，
    // 強制使用 C locale + UTF8。
    initdbFlags: ['--locale=C', '--encoding=UTF8'],
    onLog: () => {},
    onError: () => {},
  });

  console.log(`[dev-db] 初始化 PostgreSQL（port ${PG_PORT}，資料目錄 ${DATA_DIR}）…`);
  try {
    await pg.initialise();
    console.log('[dev-db] 啟動 PostgreSQL…');
    await pg.start();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[dev-db] PostgreSQL 啟動失敗：${message}`);
    if (/restricted token|invalid byte sequence|initdb/i.test(message)) {
      console.error(
        '[dev-db] 提示：此錯誤通常發生於 Windows 沙箱環境（initdb 無法建立 restricted token）。' +
          '請改用 docker compose（infra/docker/docker-compose.yml）或在一般終端機/CI 執行。',
      );
    }
    throw err;
  }

  const exists = pg.getPgClient();
  await exists.connect();
  const { rowCount } = await exists.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    PG_DB,
  ]);
  if ((rowCount ?? 0) === 0) {
    await exists.query(`CREATE DATABASE "${PG_DB}"`);
  }
  await exists.end();

  const client = pg.getPgClient();
  await client.connect();
  const sql = await readFile(INIT_SQL, 'utf8');
  await client.query(sql);
  await client.end();
  console.log(`[dev-db] PostgreSQL 就緒（db=${PG_DB}，schema 已建立）`);
  return pg;
}

async function startRedis() {
  let redis;
  let child;
  try {
    redis = new RedisMemoryServer({ port: REDIS_PORT, ip: '127.0.0.1' });
    await redis.start();
    await pingRedis(REDIS_PORT);
  } catch {
    // redis-memory-server 在部分 Windows 環境綁定失敗，改用內建 Memurai 二進位直接啟動。
    const binary = join(
      process.cwd(),
      'node_modules/.cache/redis-memory-server/redis-binaries/stable/memurai.exe',
    );
    if (!existsSync(binary)) throw new Error('找不到可用的 Redis/Memurai 二進位');
    const dataDir = join(tmpdir(), 'shieldscan-redis-data');
    child = spawn(
      binary,
      [
        '--port',
        String(REDIS_PORT),
        '--bind',
        '127.0.0.1',
        '--save',
        '""',
        '--appendonly',
        'no',
        '--dir',
        dataDir,
        '--daemonize',
        'no',
      ],
      { stdio: 'ignore', shell: false },
    );
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Redis 啟動逾時')), 8000);
      const poll = async () => {
        try {
          await pingRedis(REDIS_PORT);
          clearTimeout(timer);
          resolve();
        } catch {
          setTimeout(poll, 300);
        }
      };
      child.once('error', reject);
      void poll();
    });
  }
  console.log(`[dev-db] Redis 就緒（port ${REDIS_PORT}）`);
  return { redis, child };
}

export async function startDevDatabases() {
  const pg = await startPostgres();
  const { redis, child } = await startRedis();
  return {
    pg,
    redis,
    pgClient: () => pg.getPgClient(),
    stop: async () => {
      if (child) child.kill();
      if (redis) await redis.stop().catch(() => {});
      await pg.stop().catch(() => {});
    },
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const dbs = await startDevDatabases();
  const once = process.argv.includes('--once');
  if (once) {
    await dbs.stop();
    console.log('[dev-db] 驗證完成，已停止');
  } else {
    console.log('[dev-db] 執行中，Ctrl+C 停止');
    process.on('SIGINT', async () => {
      await dbs.stop();
      process.exit(0);
    });
    await new Promise(() => {});
  }
}
