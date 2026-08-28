import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  SCHEMA_VERSION,
  type EnvironmentReport,
  type PolicyDecision,
  validateEnvironmentReport,
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
  type ReportRepository,
  type VisitorProfile,
} from '@shieldscan/repository';
import {
  defaultRules,
  ScoringEngine,
  type ScoreResult,
  type ScoringProfile,
} from '@shieldscan/scoring-engine';

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
const repository: ReportRepository = createRepository(databaseUrl);

const networkProvider: GeoIpProvider =
  process.env.NETWORK_PROVIDER === 'ip-api' ? new IpApiProvider() : new MockGeoIpProvider();

/** 預設評分 Profile：與 planning 文件中的 privacy-default 一致。 */
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
const auditLog: Array<Record<string, unknown>> = [];

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

/**
 * POST /v1/reports
 *
 * Phase 2：契約驗證 → Server 端訊號附加（L0/L1）→ 網路分析 →
 * 評分 → 儲存（PostgreSQL / InMemory）→ 回傳。
 */
app.post('/v1/reports', async (request, reply) => {
  const validation = validateEnvironmentReport(request.body);
  if (!validation.ok) return validationReply(reply, validation);

  const ip = requestIp(request);
  const report: EnvironmentReport = validation.data;

  // 附加 Server 端信任錨點訊號（headers / TLS 指紋介面）。
  const serverSignals = await collectServerSignals({
    headers: request.headers as Record<string, string | undefined>,
    ip,
  });
  report.signals = [...report.signals, ...serverSignals];

  const network = await analyzeRequestNetwork(ip, report);
  const score = await buildScoringEngine().calculate(report, report.issues, DEFAULT_PROFILE);

  // 把伺服器端的網路分析一併持久化，歷史報告可回溯當時判決。
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

  app.log.info({ reportId: report.reportId, ip, score: score.finalScore }, 'report ingested');

  return reply.code(201).send({
    reportId: report.reportId,
    schemaVersion: report.schemaVersion ?? SCHEMA_VERSION,
    score,
    policy: scoreToPolicy(score),
    network,
  });
});

app.get('/v1/reports/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const stored = await repository.getReport(id);
  if (!stored) return reply.code(404).send({ error: 'report_not_found' });
  return stored;
});

/** DELETE /v1/reports/:id：單筆報告刪除（個資刪除請求）。 */
app.delete('/v1/reports/:id', async (request, reply) => {
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

/** GET /v1/visitors/:visitorId/reports：同 visitor 跨 IP 歷史報告（驗收指標）。 */
app.get('/v1/visitors/:visitorId/reports', async (request, reply) => {
  const { visitorId } = request.params as { visitorId: string };
  const reports = await repository.listReportsByVisitor(visitorId);
  const visitor = await repository.getVisitor(visitorId);
  return { visitorId, visitor, reports };
});

/** DELETE /v1/visitors/:visitorId：訪客及其全部報告刪除（被遺忘權）。 */
app.delete('/v1/visitors/:visitorId', async (request, reply) => {
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

  return {
    score,
    issues: report.issues,
    policy: scoreToPolicy(score),
  };
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

/** GET /v1/network/self：L0/L1 信任錨點（來源 IP 的 Geo/ASN/ISP/Proxy/VPN/Tor/DC）。 */
app.get('/v1/network/self', async (request) => {
  const ip = requestIp(request);
  const network = await analyzeRequestNetwork(ip);
  return { ip, network };
});

/**
 * POST /v1/port-scan
 *
 * 合規限制：
 * - 只掃請求者自己的來源 IP（target 由伺服器決定，不接受任意目標）。
 * - 每 IP 每小時最多 5 次。
 * - 每次掃描寫審計日誌。
 */
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

/** GET /v1/audit-logs：敏感操作審計（合規需求）。 */
app.get('/v1/audit-logs', async () => ({ logs: auditLog }));

app.get('/v1/plugin-profile', async (_request, reply) => {
  // TODO: 需要 Plugin Registry（資料庫）後實作。
  reply.code(501).send({ error: 'not_implemented', message: 'Plugin Registry 尚未接入' });
});

app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
