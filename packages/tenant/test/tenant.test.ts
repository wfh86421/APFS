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

test('金鑰清單：不含 hash，且跨租戶不可見', async () => {
  const service = new TenantService(new InMemoryTenantStore());
  const a = await service.createTenant({ name: 'A', email: 'a@example.com' });
  const b = await service.createTenant({ name: 'B', email: 'b@example.com' });
  await service.issueApiKey(a.tenant.tenantId, 'extra', 'risk_analyst');

  const listA = await service.listApiKeys(a.tenant.tenantId);
  assert.equal(listA.length, 2);
  assert.ok(listA.every((k) => !('keyHash' in k)));
  const roles = listA.map((k) => k.role).sort();
  assert.deepEqual(roles, ['risk_analyst', 'security_admin']);

  const listB = await service.listApiKeys(b.tenant.tenantId);
  assert.equal(listB.length, 1);
});

test('撤銷金鑰：撤銷後 verify 失敗、清單帶 revokedAt、重複撤銷冪等', async () => {
  const service = new TenantService(new InMemoryTenantStore());
  const { tenant, issued } = await service.createTenant({ name: 'X', email: 'x@example.com' });

  const revoked = await service.revokeApiKey(tenant.tenantId, issued.keyId);
  assert.equal(revoked.found, true);
  assert.ok(revoked.revokedAt);

  assert.equal(await service.verifyApiKey(issued.apiKey), null);

  const again = await service.revokeApiKey(tenant.tenantId, issued.keyId);
  assert.equal(again.found, true);
  assert.equal(again.revokedAt, revoked.revokedAt);

  const list = await service.listApiKeys(tenant.tenantId);
  assert.equal(list.length, 1);
  assert.equal(list[0]?.revokedAt, revoked.revokedAt);
});

test('輪換金鑰：舊金鑰失效、新金鑰可用且同角色', async () => {
  const service = new TenantService(new InMemoryTenantStore());
  const { tenant, issued } = await service.createTenant({ name: 'Y', email: 'y@example.com' });

  const rotated = await service.rotateApiKey(tenant.tenantId, issued.keyId);
  assert.equal(rotated.found, true);
  assert.ok(rotated.issued);
  assert.ok(rotated.issued.apiKey.startsWith('shd_live_'));
  assert.equal(rotated.role, 'security_admin');

  // 舊金鑰失效，新金鑰可通過驗證
  assert.equal(await service.verifyApiKey(issued.apiKey), null);
  const verified = await service.verifyApiKey(rotated.issued.apiKey);
  assert.ok(verified);
  assert.equal(verified.tenant.tenantId, tenant.tenantId);
});

test('撤銷/輪換不存在或他租戶的金鑰：found=false', async () => {
  const service = new TenantService(new InMemoryTenantStore());
  const a = await service.createTenant({ name: 'A', email: 'a@example.com' });
  const b = await service.createTenant({ name: 'B', email: 'b@example.com' });

  const missing = await service.revokeApiKey(a.tenant.tenantId, 'no-such-key');
  assert.equal(missing.found, false);

  const crossTenant = await service.revokeApiKey(b.tenant.tenantId, a.issued.keyId);
  assert.equal(crossTenant.found, false);
  // 原租戶金鑰不受影響
  assert.ok(await service.verifyApiKey(a.issued.apiKey));
});
