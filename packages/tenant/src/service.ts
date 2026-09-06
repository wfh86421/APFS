import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  BillingRecord,
  FREE_UNITS_PER_MONTH,
  OVERAGE_UNIT_PRICE,
  PLAN_PRICES,
  Tenant,
  UsageRecord,
  type AdminRole,
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

/** 金鑰清單 DTO：不含 keyHash，避免外洩比對值。 */
export interface ApiKeySummary {
  keyId: string;
  label: string;
  role: AdminRole;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export type KeyOpResult =
  | { found: true; revokedAt?: string; issued?: IssuedApiKey; role?: AdminRole }
  | { found: false };

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
    const issued = await this.issueApiKey(tenant.tenantId, 'default', 'security_admin');
    return { tenant, issued };
  }

  async issueApiKey(
    tenantId: string,
    label: string,
    role: AdminRole = 'security_admin',
  ): Promise<IssuedApiKey> {
    const apiKey = `shd_live_${randomBytes(24).toString('base64url')}`;
    const keyId = randomUUID();
    await this.store.createApiKey({
      keyId,
      tenantId,
      label,
      keyHash: this.hashKey(apiKey),
      role,
      createdAt: new Date().toISOString(),
    });
    return { apiKey, keyId, label };
  }

  async listApiKeys(tenantId: string): Promise<ApiKeySummary[]> {
    const keys = await this.store.listApiKeys(tenantId);
    return keys.map((record) => this.toSummary(record));
  }

  async getApiKey(tenantId: string, keyId: string): Promise<ApiKeySummary | null> {
    const record = await this.store.getApiKeyById(tenantId, keyId);
    return record ? this.toSummary(record) : null;
  }

  /** 撤銷金鑰：不存在回 found:false；已撤銷則冪等回傳既有 revokedAt。 */
  async revokeApiKey(tenantId: string, keyId: string): Promise<KeyOpResult> {
    const key = await this.store.getApiKeyById(tenantId, keyId);
    if (!key) return { found: false };
    if (key.revokedAt) return { found: true, revokedAt: key.revokedAt };
    const at = new Date().toISOString();
    await this.store.revokeApiKey(tenantId, keyId, at);
    return { found: true, revokedAt: at };
  }

  /** 輪換金鑰：撤銷舊金鑰並簽發同角色新金鑰（舊金鑰立即失效）。 */
  async rotateApiKey(tenantId: string, keyId: string): Promise<KeyOpResult> {
    const key = await this.store.getApiKeyById(tenantId, keyId);
    if (!key) return { found: false };
    if (key.revokedAt) return { found: true, revokedAt: key.revokedAt };
    const at = new Date().toISOString();
    await this.store.revokeApiKey(tenantId, keyId, at);
    const role = (key.role ?? 'security_admin') as AdminRole;
    const issued = await this.issueApiKey(tenantId, key.label ?? 'additional', role);
    return { found: true, revokedAt: at, issued, role };
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

  private toSummary(record: {
    keyId: string;
    label: string;
    role?: AdminRole;
    createdAt: string;
    lastUsedAt?: string;
    revokedAt?: string;
  }): ApiKeySummary {
    return {
      keyId: record.keyId,
      label: record.label,
      role: (record.role ?? 'security_admin') as AdminRole,
      createdAt: record.createdAt,
      lastUsedAt: record.lastUsedAt,
      revokedAt: record.revokedAt,
    };
  }
}
