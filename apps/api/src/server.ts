import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  SCHEMA_VERSION,
  type EnvironmentReport,
  type PolicyDecision,
  type RiskEvent,
  type RiskEventType,
  validateFieldDefinition,
  validateEnvironmentReport,
  validateRiskEvent,
  type ValidationFailure,
} from '@shieldscan/core-schema';
import {
  analyzeIp,
  IpApiProvider,
  MockGeoIpProvider,
  type GeoIpProvider,
  type NetworkAnalysis,
} from '@shieldscan/network-intel';
import { collectServerSignals } from '@shieldscan/node-sdk';
import { scanPorts } from '@shieldscan/port-scanner';
import {
  createRepository,
  createRiskRepository,
  type ReportRepository,
  type RiskRepository,
  type VisitorProfile,
} from '@shieldscan/repository';
import {
  defaultRules,
  ScoringEngine,
  type ScoreResult,
  type ScoringProfile,
} from '@shieldscan/scoring-engine';
import { verifySignedReport } from '@shieldscan/signing';
import {
  createTenantStore,
  TenantService,
  type ApiKeyRecord,
  type Tenant,
} from '@shieldscan/tenant';

const app = Fastify({ logger: true });

const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
void app.register(cors, {
  origin: allowedOrigins.length > 0 ? allowedOrigins : true,
});

const port = Number(process.env.PORT ?? 3001);
const databaseUrl = process.env.DATABASE_URL;
const signingSecret = process.env.REPORT_SIGNING_SECRET;
const repository: ReportRepository = createRepository(databaseUrl);
const riskRepository: RiskRepository = createRiskRepository(databaseUrl);
const tenantService = new TenantService(createTenantStore(databaseUrl));

const networkProvider: GeoIpProvider =
  process.env.NETWORK_PROVIDER === 'ip-api' ? new IpApiProvider() : new MockGeoIpProvider();

const DEFAULT_PROFILE: ScoringProfile = {
  profileId: 'privacy-default',
  weights: {
    privacyExposure: 100,
    authenticity: 100,
    automationRisk: 100,
    networkTrust: 100,
  },
  thresholds: {
    allow: 70,
    review: 60,
    challenge: 50,
    block: 30,
  },
};

const portScanAttempts = new Map<string, number[]>();
const keyRateLimits = new Map<string, number[]>();
const auditLog: Array<Record<string, unknown>> = [];

interface Webhook {
  id: string;
  tenantId: string;
  url: string;
  events: string[];
  isEnabled: boolean;
  createdAt: string;
}
const webhooksByTenant = new Map<string, Webhook[]>();

function buildScoringEngine(): ScoringEngine {
  const engine = new ScoringEngine();
  for (const rule of defaultRules()) engine.registerRule(rule);
  return engine;
}

function scoreToPolicy(score: ScoreResult): PolicyDecision {
  switch (score.riskLevel) {
    case 'critical':
      return 'block';
    case 'high':
      return 'challenge';
    case 'medium':
      return 'review';
    default:
      return 'allow';
  }
}

function requestIp(request: {
  headers: Record<string, unknown>;
  socket: { remoteAddress?: string };
}): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() ?? forwarded.trim();
  }
  const remote = request.socket.remoteAddress ?? 'unknown';
  return remote.replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1');
}

function validationReply(
  reply: { code: (code: number) => { send: (body: unknown) => unknown } },
  failure: ValidationFailure,
) {
  return reply.code(400).send({ error: 'invalid_report', issues: failure.errors });
}

async function resolveAuth(request: {
  headers: Record<string, unknown>;
}): Promise<{ tenant: Tenant; key: ApiKeyRecord } | null> {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const apiKey = header.slice('Bearer '.length).trim();
  if (!apiKey) return null;
  const verified = await tenantService.verifyApiKey(apiKey);
  if (!verified || !verified.key) return null;

  // API Key 限流：每 key 每分鐘 60 次。
  const now = Date.now();
  const windowMs = 60 * 1000;
  const attempts = (keyRateLimits.get(verified.key.keyId) ?? []).filter((t) => now - t < windowMs);
  if (attempts.length >= 60) return null;
  keyRateLimits.set(verified.key.keyId, [...attempts, now]);

  return { tenant: verified.tenant, key: verified.key };
}

async function verifyReportSignature(
  report: EnvironmentReport,
  tenant: Tenant | null,
): Promise<{ required: boolean; verified: boolean | null; reason?: string }> {
  if (!signingSecret) return { required: false, verified: null };
  if (!report.integrity.signature) {
    return tenant
      ? { required: true, verified: false, reason: 'missing_signature' }
      : { required: false, verified: false, reason: 'missing_signature' };
  }
  const result = await verifySignedReport(report, signingSecret);
  return { required: true, verified: result.valid, reason: result.reason };
}

async function fireRiskWebhooks(input: {
  tenantId?: string;
  reportId: string;
  score: ScoreResult;
  policy: PolicyDecision;
  network: NetworkAnalysis;
}): Promise<void> {
  const targets = input.tenantId ? (webhooksByTenant.get(input.tenantId) ?? []) : [];
  for (const webhook of targets) {
    if (!webhook.isEnabled) continue;
    const payload = {
      type: 'risk_event',
      reportId: input.reportId,
      score: input.score.finalScore,
      grade: input.score.grade,
      riskLevel: input.score.riskLevel,
      policy: input.policy,
      networkRisk: input.network.riskLevel,
      tenantId: input.tenantId,
      at: new Date().toISOString(),
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) break;
      } catch (err) {
        app.log.warn({ webhook: webhook.id, attempt }, 'webhook delivery failed');
      }
    }
  }
}

function extractVisitorProfile(report: EnvironmentReport): VisitorProfile {
  const hashOf = (key: string) => report.signals.find((s) => s.key === key)?.hash;
  const ua = report.signals.find((s) => s.key === 'ua')?.value as
    | { userAgent?: string }
    | undefined;
  const userAgent = String(ua?.userAgent ?? '');

  return {
    visitorId: report.subjectId ?? report.sessionId,
    canvasHash: hashOf('canvas'),
    webglHash: hashOf('webgl'),
    webgpuHash: hashOf('webgpu'),
    audioHash: hashOf('audio'),
    osFamily: /Android/i.test(userAgent)
      ? 'Android'
      : /Windows/i.test(userAgent)
        ? 'Windows'
        : /iPhone|iPad/i.test(userAgent)
          ? 'iOS'
          : /Macintosh/i.test(userAgent)
            ? 'macOS'
            : undefined,
    browserFamily: /Brave/i.test(userAgent)
      ? 'Brave'
      : /Edg/i.test(userAgent)
        ? 'Edge'
        : /Firefox/i.test(userAgent)
          ? 'Firefox'
          : /Chrome/i.test(userAgent)
            ? 'Chrome'
            : undefined,
    firstSeen: report.createdAt,
    lastSeen: report.createdAt,
    scanCount: 1,
    ipHistory: [],
  };
}

async function analyzeRequestNetwork(
  ip: string,
  report?: EnvironmentReport,
): Promise<NetworkAnalysis> {
  const webrtc = report?.signals.find((s) => s.key === 'webrtc')?.value as
    | { localIps?: string[] }
    | undefined;
  const dnsSignal = report?.signals.find((s) => s.key === 'dnsLeak')?.value as
    | { dnsServers?: string[] }
    | undefined;

  return analyzeIp(ip, networkProvider, {
    localIps: webrtc?.localIps,
    dnsServers: dnsSignal?.dnsServers,
  });
}

app.get('/health', async () => ({ status: 'ok', service: 'shieldscan-api' }));

/* ------------------------------------------------------------------ */
/* Phase 3：租戶 / API Key / 計費                                       */
/* ------------------------------------------------------------------ */

/** 自助註冊：建立租戶並簽發 API Key（明文僅回傳一次）。 */
app.post('/v1/tenants', async (request, reply) => {
  const body = request.body as { name?: string; email?: string; plan?: string };
  if (!body.name || !body.email) {
    return reply.code(400).send({ error: 'missing_fields', required: ['name', 'email'] });
  }
  const { tenant, issued } = await tenantService.createTenant({
    name: String(body.name),
    email: String(body.email),
    plan: (body.plan as Tenant['plan']) ?? 'free',
  });
  return reply.code(201).send({
    tenant,
    apiKey: issued.apiKey,
    keyId: issued.keyId,
    note: '請立即保存 API Key，明文僅此一次顯示。',
  });
});

/** 目前租戶資訊（需 API Key）。 */
app.get('/v1/tenant/me', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const usage = await tenantService.currentUsage(auth.tenant.tenantId);
  return { tenant: auth.tenant, key: auth.key, usage };
});

/** 簽發額外 API Key（需 API Key）。 */
app.post('/v1/tenant/keys', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const body = request.body as { label?: string };
  const issued = await tenantService.issueApiKey(
    auth.tenant.tenantId,
    body.label ?? 'additional',
  );
  return reply.code(201).send({ ...issued, note: '明文僅此一次顯示。' });
});

/** 本月用量與發票（需 API Key）。 */
app.get('/v1/billing/current', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const usage = await tenantService.currentUsage(auth.tenant.tenantId);
  const invoices = await tenantService.getInvoices(auth.tenant.tenantId);
  return { tenant: auth.tenant, usage, invoices };
});

/** 產生本期發票（需 API Key）。 */
app.post('/v1/billing/invoices/current', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const invoice = await tenantService.createInvoice(auth.tenant.tenantId);
  return reply.code(201).send({ invoice });
});

/** 註冊 Webhook（需 API Key）。 */
app.post('/v1/webhooks', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const body = request.body as { url?: string; events?: string[] };
  const isHttps = typeof body.url === 'string' && /^https:\/\//.test(body.url);
  const isLocalHttp =
    typeof body.url === 'string' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(body.url);
  if (!body.url || !(isHttps || isLocalHttp)) {
    return reply
      .code(400)
      .send({ error: 'invalid_url', message: 'Webhook 必須為 https URL（本地可用 http://localhost）' });
  }
  const webhook: Webhook = {
    id: crypto.randomUUID(),
    tenantId: auth.tenant.tenantId,
    url: body.url,
    events: body.events ?? ['risk_event'],
    isEnabled: true,
    createdAt: new Date().toISOString(),
  };
  const list = webhooksByTenant.get(auth.tenant.tenantId) ?? [];
  list.push(webhook);
  webhooksByTenant.set(auth.tenant.tenantId, list);
  return reply.code(201).send({ webhook });
});

app.get('/v1/webhooks', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  return { webhooks: webhooksByTenant.get(auth.tenant.tenantId) ?? [] };
});

/* ------------------------------------------------------------------ */
/* 風險事件 / 欄位定義（Phase 1 風險偵測管理平台）                        */
/* ------------------------------------------------------------------ */

app.post('/v1/risk-events', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });

  const body = request.body as unknown;
  const items = Array.isArray(body) ? body : [body];
  if (items.length === 0 || items.length > 200) {
    return reply.code(400).send({ error: 'invalid_payload' });
  }

  const events: RiskEvent[] = [];
  for (const item of items) {
    const result = validateRiskEvent(item);
    if (!result.ok) {
      return reply
        .code(400)
        .send({ error: 'invalid_risk_event', issues: result.errors });
    }
    events.push({
      ...result.data,
      tenantId: result.data.tenantId ?? auth.tenant.tenantId,
    });
  }
  await riskRepository.insertRiskEvents(events);
  return reply.code(201).send({ inserted: events.length });
});

app.get('/v1/risk-events', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });

  const query = request.query as {
    sessionId?: string;
    severity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
    eventType?: string;
    limit?: string;
  };
  const events = await riskRepository.listRiskEvents({
    sessionId: query.sessionId,
    severity: query.severity,
    eventType: query.eventType as RiskEventType,
    limit: query.limit ? Math.max(1, Math.min(500, Number(query.limit))) : undefined,
  });
  return { events };
});

app.get('/v1/fields', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const query = request.query as { limit?: string };
  const definitions = await riskRepository.listFieldDefinitions(
    query.limit ? Math.max(1, Math.min(1000, Number(query.limit))) : undefined,
  );
  return { definitions };
});

app.put('/v1/fields', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });

  const result = validateFieldDefinition(request.body);
  if (!result.ok) {
    return reply.code(400).send({ error: 'invalid_field_definition', issues: result.errors });
  }
  await riskRepository.upsertFieldDefinition(result.data);
  return { ok: true, definition: result.data };
});

/* ------------------------------------------------------------------ */
/* 報告 / 網路 / 掃描                                                   */
/* ------------------------------------------------------------------ */

app.post('/v1/reports', async (request, reply) => {
  const validation = validateEnvironmentReport(request.body);
  if (!validation.ok) return validationReply(reply, validation);

  const ip = requestIp(request);
  const report: EnvironmentReport = validation.data;
  const auth = await resolveAuth(request);

  // Phase 3 正式簽章驗證：租戶（SDK 客戶）必須簽章，匿名掃描不強制。
  const integrity = await verifyReportSignature(report, auth?.tenant ?? null);
  if (integrity.required && integrity.verified === false) {
    return reply.code(401).send({
      error: 'invalid_signature',
      reason: integrity.reason,
      message: '報告簽章驗證失敗',
    });
  }

  const serverSignals = await collectServerSignals({
    headers: request.headers as Record<string, string | undefined>,
    ip,
  });
  report.signals = [...report.signals, ...serverSignals];

  const network = await analyzeRequestNetwork(ip, report);
  const score = await buildScoringEngine().calculate(report, report.issues, DEFAULT_PROFILE);
  const policy = scoreToPolicy(score);

  // 把伺服器端網路分析一併持久化，歷史報告可回溯當時判決。
  const reportToStore: EnvironmentReport = {
    ...report,
    raw: { ...(report.raw as object | undefined), network },
  };
  await repository.saveReport(reportToStore, {
    clientIp: ip,
    privacyScore: score.finalScore,
    grade: score.grade,
    riskLevel: score.riskLevel,
    retentionDays: report.consent.retentionDays,
  });
  const visitor = extractVisitorProfile(report);
  visitor.ipHistory = [ip];
  await repository.upsertVisitor(visitor.visitorId, visitor);

  if (auth) {
    await tenantService.recordUsage(auth.tenant.tenantId, 1, 'report');
  }

  // 高風險事件 → Webhook 通知。
  if (score.riskLevel === 'high' || score.riskLevel === 'critical') {
    await fireRiskWebhooks({
      tenantId: auth?.tenant.tenantId,
      reportId: report.reportId,
      score,
      policy,
      network,
    });
  }

  app.log.info(
    { reportId: report.reportId, ip, score: score.finalScore, tenant: auth?.tenant.tenantId },
    'report ingested',
  );

  return reply.code(201).send({
    reportId: report.reportId,
    schemaVersion: report.schemaVersion ?? SCHEMA_VERSION,
    tenantId: auth?.tenant.tenantId,
    integrity,
    score,
    policy,
    network,
  });
});

app.get('/v1/reports/:id', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const { id } = request.params as { id: string };
  const stored = await repository.getReport(id);
  if (!stored) return reply.code(404).send({ error: 'report_not_found' });
  return stored;
});

/** DELETE /v1/reports/:id：刪除單筆報告（GDPR/個資刪除請求，需 API Key）。 */
app.delete('/v1/reports/:id', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const { id } = request.params as { id: string };
  const deleted = await repository.deleteReport(id);
  if (!deleted) return reply.code(404).send({ error: 'report_not_found' });
  auditLog.unshift({
    id: auditLog.length + 1,
    action: 'report-delete',
    targetIp: requestIp(request),
    actorIp: requestIp(request),
    metadata: { reportId: id },
    createdAt: new Date().toISOString(),
  });
  return reply.code(204).send();
});

app.get('/v1/visitors/:visitorId/reports', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const { visitorId } = request.params as { visitorId: string };
  const reports = await repository.listReportsByVisitor(visitorId);
  const visitor = await repository.getVisitor(visitorId);
  return { visitorId, visitor, reports };
});

/** DELETE /v1/visitors/:visitorId：刪除訪客及其全部報告（被遺忘權，需 API Key）。 */
app.delete('/v1/visitors/:visitorId', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const { visitorId } = request.params as { visitorId: string };
  const deleted = await repository.deleteVisitor(visitorId);
  if (!deleted) return reply.code(404).send({ error: 'visitor_not_found' });
  auditLog.unshift({
    id: auditLog.length + 1,
    action: 'visitor-delete',
    targetIp: requestIp(request),
    actorIp: requestIp(request),
    metadata: { visitorId },
    createdAt: new Date().toISOString(),
  });
  return reply.code(204).send();
});

app.post('/v1/analyze', async (request, reply) => {
  const body = request.body as { report?: unknown; profileId?: string };
  const validation = validateEnvironmentReport(body?.report);
  if (!validation.ok) return validationReply(reply, validation);

  const report: EnvironmentReport = validation.data;
  const engine = buildScoringEngine();
  const profile =
    body.profileId && body.profileId !== DEFAULT_PROFILE.profileId
      ? { ...DEFAULT_PROFILE, profileId: body.profileId }
      : DEFAULT_PROFILE;
  const score = await engine.calculate(report, report.issues, profile);
  return { score, issues: report.issues, policy: scoreToPolicy(score) };
});

app.post('/v1/scoring/calculate', async (request, reply) => {
  const body = request.body as { report?: unknown; profile?: ScoringProfile };
  const validation = validateEnvironmentReport(body?.report);
  if (!validation.ok) return validationReply(reply, validation);
  const report: EnvironmentReport = validation.data;
  const profile: ScoringProfile = body.profile ?? DEFAULT_PROFILE;
  const score = await buildScoringEngine().calculate(report, report.issues, profile);
  return { score };
});

app.get('/v1/network/self', async (request) => {
  const ip = requestIp(request);
  const network = await analyzeRequestNetwork(ip);
  return { ip, network };
});

app.post('/v1/port-scan', async (request, reply) => {
  const ip = requestIp(request);
  const windowMs = 60 * 60 * 1000;
  const maxAttempts = 5;
  const now = Date.now();
  const attempts = (portScanAttempts.get(ip) ?? []).filter((t) => now - t < windowMs);

  if (attempts.length >= maxAttempts) {
    return reply.code(429).send({
      error: 'rate_limited',
      message: `每 IP 每小時最多掃描 ${maxAttempts} 次`,
      retryAfterSeconds: Math.ceil((windowMs - (now - (attempts[0] ?? now))) / 1000),
    });
  }

  const body = request.body as { ports?: number[] };
  const requestedPorts = Array.isArray(body.ports) ? body.ports : [22, 3389, 445];
  const allowed = [22, 80, 443, 3389, 445, 8080, 3306];
  const sanitized = [...new Set(requestedPorts.filter((p) => allowed.includes(p)))];

  portScanAttempts.set(ip, [...attempts, now]);
  auditLog.unshift({
    id: auditLog.length + 1,
    action: 'port-scan',
    targetIp: ip,
    actorIp: ip,
    metadata: { ports: sanitized },
    createdAt: new Date().toISOString(),
  });

  const results = await scanPorts(ip, sanitized.length > 0 ? sanitized : [22]);
  app.log.info({ ip, ports: sanitized }, 'port scan completed');
  return { ip, results, auditId: auditLog.length };
});

app.get('/v1/audit-logs', async () => ({ logs: auditLog }));

app.get('/v1/plugin-profile', async (_request, reply) => {
  reply.code(501).send({ error: 'not_implemented', message: 'Plugin Registry 尚未接入' });
});

app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
