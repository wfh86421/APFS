import type {
  ApiKeyRecord,
  BillingRecord,
  Tenant,
  UsageRecord,
} from '../types.js';
import type { TenantStore } from './types.js';

export class InMemoryTenantStore implements TenantStore {
  private readonly tenants = new Map<string, Tenant>();
  private readonly apiKeys = new Map<string, ApiKeyRecord>();
  private readonly usage = new Map<string, UsageRecord[]>();
  private readonly invoices = new Map<string, BillingRecord[]>();

  async createTenant(tenant: Tenant): Promise<void> {
    this.tenants.set(tenant.tenantId, tenant);
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    return this.tenants.get(tenantId) ?? null;
  }

  async createApiKey(record: ApiKeyRecord): Promise<void> {
    this.apiKeys.set(record.keyHash, record);
  }

  async getApiKeyByHash(hash: string): Promise<ApiKeyRecord | null> {
    return this.apiKeys.get(hash) ?? null;
  }

  async touchApiKey(keyId: string, at: string): Promise<void> {
    for (const record of this.apiKeys.values()) {
      if (record.keyId === keyId) {
        record.lastUsedAt = at;
        return;
      }
    }
  }

  async addUsage(record: UsageRecord): Promise<void> {
    const list = this.usage.get(record.tenantId) ?? [];
    list.push(record);
    this.usage.set(record.tenantId, list);
  }

  async getUsage(tenantId: string, since: string, until: string): Promise<UsageRecord[]> {
    return (this.usage.get(tenantId) ?? []).filter(
      (u) => u.createdAt >= since && u.createdAt <= until,
    );
  }

  async saveInvoice(record: BillingRecord): Promise<void> {
    const list = this.invoices.get(record.tenantId) ?? [];
    list.push(record);
    this.invoices.set(record.tenantId, list);
  }

  async getInvoices(tenantId: string): Promise<BillingRecord[]> {
    return this.invoices.get(tenantId) ?? [];
  }
}
