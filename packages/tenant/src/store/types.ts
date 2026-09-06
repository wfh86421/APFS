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
  /** 依 keyId 讀取（限同一租戶）。 */
  getApiKeyById(tenantId: string, keyId: string): Promise<ApiKeyRecord | null>;
  /** 列出租戶所有金鑰（含已撤銷，不含比對用 hash 以外的敏感值）。 */
  listApiKeys(tenantId: string): Promise<ApiKeyRecord[]>;
  /** 撤銷金鑰（僅限未撤銷者；冪等由呼叫端處理）。 */
  revokeApiKey(tenantId: string, keyId: string, at: string): Promise<void>;
  touchApiKey(keyId: string, at: string): Promise<void>;
  addUsage(record: UsageRecord): Promise<void>;
  getUsage(tenantId: string, since: string, until: string): Promise<UsageRecord[]>;
  saveInvoice(record: BillingRecord): Promise<void>;
  getInvoices(tenantId: string): Promise<BillingRecord[]>;
}
