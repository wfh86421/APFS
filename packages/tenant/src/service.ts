import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  BillingRecord,
  FREE_UNITS_PER_MONTH,
  OVERAGE_UNIT_PRICE,
  PLAN_PRICES,
  Tenant,
  UsageRecord,
} from './types.js';
import type { TenantStore } from './store/types.js';

export interface CreateTenantInput {
  name: string;
  email: string;
  plan?: Tenant['plan'];
}

export interface IssuedApiKey {
  apiKey: string; // 明文僅回傳一次
  keyId: string;
  label: string;
}

export interface VerifiedApiKey {
  tenant: Tenant;
  key: Awaited<ReturnType<TenantStore['getApiKeyByHash']>>;
}

export class TenantService {
  constructor(private readonly store: TenantStore) {}

  async createTenant(input: CreateTenantInput): Promise<{ tenant: Tenant; issued: IssuedApiKey }> {
    const tenant: Tenant = {
      tenantId: randomUUID(),
      name: input.name,
      email: input.email,
      plan: input.plan ?? 'free',
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    await this.store.createTenant(tenant);
    const issued = await this.issueApiKey(tenant.tenantId, 'default');
    return { tenant, issued };
  }

  async issueApiKey(tenantId: string, label: string): Promise<IssuedApiKey> {
    const apiKey = `shd_live_${randomBytes(24).toString('base64url')}`;
    const keyId = randomUUID();
    await this.store.createApiKey({
      keyId,
      tenantId,
      label,
      keyHash: this.hashKey(apiKey),
      createdAt: new Date().toISOString(),
    });
    return { apiKey, keyId, label };
  }

  async verifyApiKey(apiKey: string): Promise<VerifiedApiKey | null> {
    if (!apiKey.startsWith('shd_live_')) return null;
    const key = await this.store.getApiKeyByHash(this.hashKey(apiKey));
    if (!key || key.revokedAt) return null;
    const tenant = await this.store.getTenant(key.tenantId);
    if (!tenant || tenant.status !== 'active') return null;
    await this.store.touchApiKey(key.keyId, new Date().toISOString());
    return { tenant, key };
  }

  async recordUsage(tenantId: string, units: number, kind: string): Promise<void> {
    const record: UsageRecord = {
      id: randomUUID(),
      tenantId,
      units,
      kind,
      createdAt: new Date().toISOString(),
    };
    await this.store.addUsage(record);
  }

  async currentUsage(tenantId: string): Promise<{
    usageUnits: number;
    periodStart: string;
    periodEnd: string;
  }> {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const records = await this.store.getUsage(tenantId, periodStart, periodEnd);
    return {
      usageUnits: records.reduce((sum, r) => sum + r.units, 0),
      periodStart,
      periodEnd,
    };
  }

  async createInvoice(tenantId: string): Promise<BillingRecord> {
    const tenant = await this.store.getTenant(tenantId);
    if (!tenant) throw new Error('tenant_not_found');

    const usage = await this.currentUsage(tenantId);
    const basePrice = PLAN_PRICES[tenant.plan] ?? 0;
    const overageUnits = Math.max(0, usage.usageUnits - FREE_UNITS_PER_MONTH);
    const overagePrice = overageUnits * OVERAGE_UNIT_PRICE;
    const totalPrice = basePrice + overagePrice;

    const invoice: BillingRecord = {
      id: randomUUID(),
      tenantId,
      periodStart: usage.periodStart,
      periodEnd: usage.periodEnd,
      usageUnits: usage.usageUnits,
      basePrice,
      overageUnits,
      overagePrice,
      totalPrice,
      currency: 'TWD',
      status: 'issued',
      invoiceNo: `INV-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${randomBytes(4).toString('hex').toUpperCase()}`,
      createdAt: new Date().toISOString(),
    };
    await this.store.saveInvoice(invoice);
    return invoice;
  }

  async getInvoices(tenantId: string): Promise<BillingRecord[]> {
    return this.store.getInvoices(tenantId);
  }

  private hashKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }
}
