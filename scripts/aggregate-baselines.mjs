#!/usr/bin/env node
/**
 * 基準分布聚合（數位黃金 Step2）：把 report_facts 彙整成 rule_baselines。
 *
 * 用法：
 *   DATABASE_URL=postgres://shieldscan:shieldscan@localhost:5432/shieldscan \
 *     node scripts/aggregate-baselines.mjs
 *
 * 每次全量重算（冪等）：rule × dim(country|asn|tz) × dim_value → total/hits/hit_rate。
 * 建議 cron 每日執行（資料量小時可每次收案後執行）。
 */

import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('[aggregate-baselines] 需要 DATABASE_URL');
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  const { rows: facts } = await client.query(
    `SELECT country, asn, tz_offset, rules_hit FROM report_facts`,
  );

  const totalBy = new Map(); // `dim|value` -> count
  const hitBy = new Map(); // `rule|dim|value` -> count

  for (const f of facts) {
    const dims = [];
    if (f.country) dims.push(['country', String(f.country)]);
    if (f.asn) dims.push(['asn', String(f.asn)]);
    if (f.tz_offset !== null && f.tz_offset !== undefined) dims.push(['tz', String(f.tz_offset)]);
    const rules = [...new Set(Array.isArray(f.rules_hit) ? f.rules_hit : [])];
    for (const [dim, value] of dims) {
      const k = `${dim}|${value}`;
      totalBy.set(k, (totalBy.get(k) ?? 0) + 1);
      for (const rule of rules) {
        const hk = `${rule}|${k}`;
        hitBy.set(hk, (hitBy.get(hk) ?? 0) + 1);
      }
    }
  }

  await client.query('BEGIN');
  await client.query('TRUNCATE rule_baselines');
  let inserted = 0;
  for (const [hk, hits] of hitBy) {
    const [rule, dim, value] = hk.split('|');
    const total = totalBy.get(`${dim}|${value}`) ?? 0;
    await client.query(
      `INSERT INTO rule_baselines (rule_id, dim, dim_value, total, hits, hit_rate, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6, NOW())`,
      [rule, dim, value, total, hits, total > 0 ? +(hits / total).toFixed(4) : 0],
    );
    inserted += 1;
  }
  await client.query('COMMIT');
  console.log(
    `[aggregate-baselines] facts=${facts.length} dim-totals=${totalBy.size} baseline-rows=${inserted}`,
  );
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  throw err;
} finally {
  await client.end();
}
