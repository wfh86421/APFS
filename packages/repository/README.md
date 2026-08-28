# @shieldscan/repository

報告與訪客儲存層，雙實作：

- `InMemoryReportRepository`：開發/測試/無資料庫環境。
- `PostgresReportRepository`：生產（schema 見 `infra/docker/postgres/init.sql`）。

```ts
import { createRepository } from '@shieldscan/repository';

const repo = createRepository(process.env.DATABASE_URL); // 未設定時自動 InMemory
await repo.saveReport(report, { clientIp: '49.214.1.196', privacyScore: 85 });
const stored = await repo.getReport(report.reportId);
const history = await repo.listReportsByVisitor(visitorId);
```

## 測試

```bash
pnpm --filter @shieldscan/repository test
```
