import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InMemoryTenantStore, TenantService } from '@shieldscan/tenant';

test('自助註冊：建立租戶並簽發 API Key', async () => {
  const service = new TenantService(new InMemoryTenantStore());
  const { tenant, issued } = await service.createTenant({
    name: 'Demo SaaS',
    email: 'dev@example.com',
    plan: 'developer',
  });

  assert.equal(tenant.plan, 'developer');
  assert.ok(issued.apiKey.startsWith('shd_live_'));
});

test('API Key 驗證：正確金鑰通過、錯誤金鑰失敗', async () => {
  const service = new TenantService(new InMemoryTenantStore());
  const { tenant, issued } = await service.createTenant({ name: 'X', email: 'x@example.com' });

  const verified = await service.verifyApiKey(issued.apiKey);
  assert.ok(verified);
  assert.equal(verified.tenant.tenantId, tenant.tenantId);

  const bad = await service.verifyApiKey('shd_live_wrong');
  assert.equal(bad, null);
});

test('用量與發票：developer 計畫 NT$2,500 + 超量費用', async () => {
  const service = new TenantService(new InMemoryTenantStore());
  const { tenant } = await service.createTenant({
    name: 'Billing Co',
    email: 'b@example.com',
    plan: 'developer',
  });

  await service.recordUsage(tenant.tenantId, 1, 'report');
  await service.recordUsage(tenant.tenantId, 1200, 'report');
  const usage = await service.currentUsage(tenant.tenantId);
  assert.equal(usage.usageUnits, 1201);

  const invoice = await service.createInvoice(tenant.tenantId);
  assert.equal(invoice.basePrice, 2500);
  assert.equal(invoice.overageUnits, 201);
  assert.equal(invoice.overagePrice, 201);
  assert.equal(invoice.totalPrice, 2701);
  assert.equal(invoice.status, 'issued');
  assert.ok(invoice.invoiceNo?.startsWith('INV-'));
});

test('free 計畫：不計 overage', async () => {
  const service = new TenantService(new InMemoryTenantStore());
  const { tenant } = await service.createTenant({ name: 'Free', email: 'f@example.com' });
  await service.recordUsage(tenant.tenantId, 200, 'report');
  const invoice = await service.createInvoice(tenant.tenantId);
  assert.equal(invoice.totalPrice, 0);
  assert.equal(invoice.overageUnits, 0);
});
