import { InMemoryTenantStore } from './in-memory.js';
import { PostgresTenantStore } from './postgres.js';
import type { TenantStore } from './types.js';

export * from './types.js';
export { InMemoryTenantStore } from './in-memory.js';
export { PostgresTenantStore } from './postgres.js';

export function createTenantStore(connectionString?: string): TenantStore {
  return connectionString
    ? new PostgresTenantStore(connectionString)
    : new InMemoryTenantStore();
}
