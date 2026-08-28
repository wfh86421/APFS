import { InMemoryReportRepository } from './in-memory.js';
import { PostgresReportRepository } from './postgres.js';
import type { ReportRepository } from './types.js';

export * from './types.js';
export { InMemoryReportRepository } from './in-memory.js';
export { PostgresReportRepository } from './postgres.js';

/** 依環境建立 repository：有 DATABASE_URL 用 Postgres，否則 InMemory。 */
export function createRepository(databaseUrl?: string): ReportRepository {
  return databaseUrl ? new PostgresReportRepository(databaseUrl) : new InMemoryReportRepository();
}
