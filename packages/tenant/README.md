# @shieldscan/tenant

租戶 / API Key / 用量計費（Phase 3）。

```ts
import { createTenantStore, TenantService } from '@shieldscan/tenant';

const service = new TenantService(createTenantStore(process.env.DATABASE_URL));

// 自助註冊（回傳明文金鑰，僅此一次）
const { tenant, issued } = await service.createTenant({
  name: 'My SaaS',
  email: 'dev@example.com',
  plan: 'developer',
});

// 驗證 API Key（Authorization: Bearer shd_live_...）
const verified = await service.verifyApiKey(issued.apiKey);

// 計量與發票
await service.recordUsage(tenant.tenantId, 1, 'report');
const invoice = await service.createInvoice(tenant.tenantId);
```

定價：Free NT$0 / Developer NT$2,500/月 / Business NT$25,000/月起 / Enterprise 報價制；
付費計畫每月免費額度 1,000 單位，超量 NT$1/單位。
