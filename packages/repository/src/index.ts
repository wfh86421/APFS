import { InMemoryReportRepository } from './in-memory.js';
import { PostgresReportRepository } from './postgres.js';
import { InMemoryRiskRepository } from './in-memory.js';
import { PostgresRiskRepository } from './risk-postgres.js';
import type { ReportRepository, RiskRepository } from './types.js';

export * from './types.js';
export { InMemoryReportRepository } from './in-memory.js';
export { InMemoryRiskRepository } from './in-memory.js';
export { PostgresReportRepository } from './postgres.js';
export { PostgresRiskRepository } from './risk-postgres.js';

/** 依環境建立 repository：有 DATABASE_URL 用 Postgres，否則 InMemory。 */
export function createRepository(databaseUrl?: string): ReportRepository {
  return databaseUrl ? new PostgresReportRepository(databaseUrl) : new InMemoryReportRepository();
}

/** Phase 1：依環境建立風險事件／欄位定義 repository。 */
export function createRiskRepository(databaseUrl?: string): RiskRepository {
  return databaseUrl ? new PostgresRiskRepository(databaseUrl) : new InMemoryRiskRepository();
}
