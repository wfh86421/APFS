import type {
  ApiKeyRecord,
  BillingRecord,
  Tenant,
  UsageRecord,
} from '../types.js';

export interface TenantStore {
  createTenant(tenant: Tenant): Promise<void>;
  getTenant(tenantId: string): Promise<Tenant | null>;
  createApiKey(record: ApiKeyRecord): Promise<void>;
  getApiKeyByHash(hash: string): Promise<ApiKeyRecord | null>;
  touchApiKey(keyId: string, at: string): Promise<void>;
  addUsage(record: UsageRecord): Promise<void>;
  getUsage(tenantId: string, since: string, until: string): Promise<UsageRecord[]>;
  saveInvoice(record: BillingRecord): Promise<void>;
  getInvoices(tenantId: string): Promise<BillingRecord[]>;
}
