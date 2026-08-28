import pg from 'pg';
import type {
  ApiKeyRecord,
  BillingRecord,
  Tenant,
  UsageRecord,
} from '../types.js';
import type { TenantStore } from './types.js';

const { Pool } = pg;

interface TenantRow {
  tenant_id: string;
  name: string;
  email: string;
  plan: string;
  status: string;
  created_at: string;
}

interface ApiKeyRow {
  key_id: string;
  tenant_id: string;
  label: string;
  key_hash: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface UsageRow {
  id: string;
  tenant_id: string;
  units: number;
  kind: string;
  created_at: string;
}

interface InvoiceRow {
  id: string;
  tenant_id: string;
  period_start: string;
  period_end: string;
  usage_units: number;
  base_price: number;
  overage_units: number;
  overage_price: number;
  total_price: number;
  currency: string;
  status: string;
  invoice_no: string | null;
  created_at: string;
}

export class PostgresTenantStore implements TenantStore {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createTenant(tenant: Tenant): Promise<void> {
    await this.pool.query(
      `INSERT INTO tenants (tenant_id, name, email, plan, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [tenant.tenantId, tenant.name, tenant.email, tenant.plan, tenant.status, tenant.createdAt],
    );
  }

  async getTenant(tenantId: string): Promise<Tenant | null> {
    const { rows } = await this.pool.query<TenantRow>(
      `SELECT * FROM tenants WHERE tenant_id = $1`,
      [tenantId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      tenantId: row.tenant_id,
      name: row.name,
      email: row.email,
      plan: row.plan as Tenant['plan'],
      status: row.status as Tenant['status'],
      createdAt: row.created_at,
    };
  }

  async createApiKey(record: ApiKeyRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO api_keys (key_id, tenant_id, label, key_hash, created_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [record.keyId, record.tenantId, record.label, record.keyHash, record.createdAt],
    );
  }

  async getApiKeyByHash(hash: string): Promise<ApiKeyRecord | null> {
    const { rows } = await this.pool.query<ApiKeyRow>(
      `SELECT * FROM api_keys WHERE key_hash = $1`,
      [hash],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      keyId: row.key_id,
      tenantId: row.tenant_id,
      label: row.label,
      keyHash: row.key_hash,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at ?? undefined,
      revokedAt: row.revoked_at ?? undefined,
    };
  }

  async touchApiKey(keyId: string, at: string): Promise<void> {
    await this.pool.query(`UPDATE api_keys SET last_used_at = $1 WHERE key_id = $2`, [
      at,
      keyId,
    ]);
  }

  async addUsage(record: UsageRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO usage_records (id, tenant_id, units, kind, created_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [record.id, record.tenantId, record.units, record.kind, record.createdAt],
    );
  }

  async getUsage(tenantId: string, since: string, until: string): Promise<UsageRecord[]> {
    const { rows } = await this.pool.query<UsageRow>(
      `SELECT * FROM usage_records
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
       ORDER BY created_at DESC`,
      [tenantId, since, until],
    );
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      units: row.units,
      kind: row.kind,
      createdAt: row.created_at,
    }));
  }

  async saveInvoice(record: BillingRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO billing_records (
        id, tenant_id, period_start, period_end, usage_units, base_price,
        overage_units, overage_price, total_price, currency, status, invoice_no, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        record.id,
        record.tenantId,
        record.periodStart,
        record.periodEnd,
        record.usageUnits,
        record.basePrice,
        record.overageUnits,
        record.overagePrice,
        record.totalPrice,
        record.currency,
        record.status,
        record.invoiceNo ?? null,
        record.createdAt,
      ],
    );
  }

  async getInvoices(tenantId: string): Promise<BillingRecord[]> {
    const { rows } = await this.pool.query<InvoiceRow>(
      `SELECT * FROM billing_records WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      usageUnits: row.usage_units,
      basePrice: row.base_price,
      overageUnits: row.overage_units,
      overagePrice: row.overage_price,
      totalPrice: row.total_price,
      currency: row.currency as BillingRecord['currency'],
      status: row.status as BillingRecord['status'],
      invoiceNo: row.invoice_no ?? undefined,
      createdAt: row.created_at,
    }));
  }
}
