export type Plan = 'free' | 'developer' | 'business' | 'enterprise';
export type TenantStatus = 'active' | 'suspended';
export type InvoiceStatus = 'draft' | 'issued' | 'paid';

export interface Tenant {
  tenantId: string;
  name: string;
  email: string;
  plan: Plan;
  status: TenantStatus;
  createdAt: string;
}

export interface ApiKeyRecord {
  keyId: string;
  tenantId: string;
  label: string;
  keyHash: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface UsageRecord {
  id: string;
  tenantId: string;
  units: number;
  kind: string;
  createdAt: string;
}

export interface BillingRecord {
  id: string;
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  usageUnits: number;
  basePrice: number;
  overageUnits: number;
  overagePrice: number;
  totalPrice: number;
  currency: 'TWD';
  status: InvoiceStatus;
  invoiceNo?: string;
  createdAt: string;
}

export const PLAN_PRICES: Record<Plan, number | null> = {
  free: 0,
  developer: 2500,
  business: 25000,
  enterprise: null, // 報價制
};

/** 每月免費額度（超過才收 overage，NT$1/單位）。 */
export const FREE_UNITS_PER_MONTH = 1000;
export const OVERAGE_UNIT_PRICE = 1;
