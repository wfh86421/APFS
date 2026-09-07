import { createHash } from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  SCHEMA_VERSION,
  type AnalysisIssue,
  type EnvironmentReport,
  type PolicyDecision,
  type ReviewStatus,
  type RiskEvent,
  type RiskEventType,
  policyDecisionForRiskLevel,
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
  type DeviceFingerprint,
  type NetworkSignal,
  type ReportRepository,
  type RiskRepository,
  type StoredReport,
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

/* 安全 headers：全端點套用（防 clickjacking / MIME sniffing / 協議降級）。 */
app.addHook('onRequest', async (_request, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // API 只回傳 JSON：default-src 'none' 不影響功能，並封鎖 frame 嵌入與 base URI 劫持。
  reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
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
  // 與前端 demo 共用同一對應（core-schema policyDecisionForRiskLevel），避免決策表漂移。
  return policyDecisionForRiskLevel(score.riskLevel);
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

const ADMIN_ROLES = ['customer_support', 'risk_analyst', 'security_admin'] as const;
type AdminRoleValue = (typeof ADMIN_ROLES)[number];

function roleOfAuth(auth: { key: ApiKeyRecord } | null): AdminRoleValue {
  return auth?.key.role ?? 'security_admin';
}

/** 角色預覽：僅 security_admin 可用 x-role 模擬其他角色；其餘角色以金鑰角色為準。 */
function roleOfRequest(
  request: { headers: Record<string, unknown> },
  auth: { key: ApiKeyRecord } | null,
): AdminRoleValue {
  const base = roleOfAuth(auth);
  if (base !== 'security_admin') return base;
  const header = request.headers['x-role'];
  return typeof header === 'string' && (ADMIN_ROLES as readonly string[]).includes(header)
    ? (header as AdminRoleValue)
    : base;
}

/** 金鑰管理授權：security_admin 可管任何金鑰；其餘角色只能管「同角色」金鑰（與簽發規則對稱）。 */
function canAdminKey(caller: AdminRoleValue, target?: string): boolean {
  if (caller === 'security_admin') return true;
  return (target ?? 'security_admin') === caller;
}

function maskIp(ip?: string): string | undefined {
  if (!ip) return undefined;
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.${parts[2]}.*`;
}

/** 依角色遮罩：非 security_admin 看不到完整 IP 與 Raw JSON。 */
function maskStoredReport(report: StoredReport, role: AdminRoleValue): StoredReport {
  const copy: StoredReport = { ...report };
  if (role !== 'security_admin') {
    copy.clientIp = maskIp(report.clientIp);
    copy.raw = undefined;
  }
  return copy;
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

/* ------------------------------------------------------------------ */
/* /v1/devices 資料接線：收案時把設備指紋/網路訊號寫入 risk 表          */
/* ------------------------------------------------------------------ */

/** 取報告中穩定訊號的雜湊（canvas/webgl/webgpu/audio/fonts/ua）。 */
function stableSignalHashes(report: EnvironmentReport): { key: string; hash: string }[] {
  const keys = ['canvas', 'webgl', 'webgpu', 'audio', 'fonts', 'ua'] as const;
  const out: { key: string; hash: string }[] = [];
  for (const key of keys) {
    const hash = report.signals.find((s) => s.key === key)?.hash;
    if (typeof hash === 'string' && hash.length > 0) out.push({ key, hash });
  }
  return out;
}

/**
 * 從報告萃取設備指紋紀錄。fingerprintHash 以 tenantId + 穩定訊號雜湊計算，
 * 避免跨租戶共用同一 PK 造成租戶間覆寫；無穩定特徵時回傳 null（不寫入）。
 */
function buildDeviceFingerprint(
  report: EnvironmentReport,
  tenantId: string,
): DeviceFingerprint | null {
  const stable = stableSignalHashes(report);
  if (stable.length === 0) return null;
  const find = (key: string) => stable.find((s) => s.key === key)?.hash;
  const material = `${tenantId}|${stable.map((s) => `${s.key}:${s.hash}`).join('|')}`;
  const days = report.consent.retentionDays ?? 0;
  return {
    fingerprintHash: createHash('sha256').update(material).digest('hex'),
    tenantId,
    canvasHash: find('canvas'),
    webglHash: find('webgl'),
    webgpuHash: find('webgpu'),
    audioHash: find('audio'),
    firstSeen: report.createdAt,
    lastSeen: report.createdAt,
    sessionCount: 1,
    ipCount: 1,
    retentionUntil:
      days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : undefined,
  };
}

/** 從報告/伺服器網路分析萃取結構化網路訊號。 */
function buildNetworkSignal(
  report: EnvironmentReport,
  tenantId: string,
  clientIp: string,
  network: NetworkAnalysis,
): NetworkSignal {
  return {
    sessionId: report.sessionId,
    reportId: report.reportId,
    tenantId,
    ipAddress: clientIp,
    isp: network.geo?.isp,
    asn: network.geo?.asn,
    country: network.geo?.country,
    proxyDetected: network.proxy,
    vpnDetected: network.vpn,
    torDetected: network.tor,
    webrtcIp: network.webrtc.publicIp,
    webrtcMismatch: network.webrtc.consistency === 'leak' || undefined,
    dnsLeakStatus: network.dnsLeak ? (network.dnsLeak.detected ? 'detected' : 'clean') : undefined,
    dnsLeakList: network.dnsLeak?.dnsServers,
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

/** 規則→RiskEventType 對照（與 scoring-engine defaultRules id 對應）。 */
const RULE_EVENT_TYPE: Record<string, RiskEventType> = {
  canvas_tamper: 'canvas_tampering',
  os_mismatch: 'os_mismatch',
  dns_leak: 'dns_leak',
  webrtc_leak: 'webrtc_mismatch',
  open_ports_ssh_rdp: 'open_ports',
  bot_detected: 'bot_suspected',
  server_datacenter_ip: 'datacenter_ip',
  server_tor_ip: 'tor_detected',
  server_vpn_detected: 'vpn_detected',
  server_proxy_detected: 'proxy_detected',
};

/** 依評分引擎觸發的規則自動產生 RiskEvent（收案證據鏈的第一環）。 */
function eventsFromScore(report: EnvironmentReport, score: ScoreResult): RiskEvent[] {
  const now = new Date().toISOString();
  return score.explanations.map((explanation) => {
    const severity =
      explanation.severity === 'critical'
        ? 'high'
        : explanation.severity === 'warning'
          ? 'medium'
          : 'info';
    return {
      eventId: crypto.randomUUID(),
      tenantId: report.tenantId,
      sessionId: report.sessionId,
      reportId: report.reportId,
      eventType: RULE_EVENT_TYPE[explanation.ruleId] ?? 'fingerprint_instability',
      severity,
      confidence: 'medium',
      evidenceJson: {
        rule: explanation.ruleId,
        track: explanation.track,
        reason: explanation.reason,
        points: explanation.points,
        riskLevel: score.riskLevel,
        finalScore: score.finalScore,
      },
      ruleId: explanation.ruleId,
      ruleVersion: '1.0.0',
      scoreImpact: -explanation.points,
      reviewRequired: explanation.severity !== 'info',
      detectedAt: now,
    };
  });
}

/**
 * 伺服器事實 → AnalysisIssue（喂給評分引擎的規則，讓規則以伺服器判定為準，
 * 不依賴客戶端自報）：資料中心/Tor/VPN/Proxy 連線、DNS 洩漏、WebRTC 不一致。
 */
function serverNetworkIssues(network: NetworkAnalysis): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const push = (
    type: string,
    severity: AnalysisIssue['severity'],
    description: string,
    evidence: Record<string, unknown>,
  ): void => {
    issues.push({ id: crypto.randomUUID(), type, severity, description, evidence });
  };
  if (network.datacenter) {
    push('server_datacenter_ip', 'medium', '伺服器判定連線來源為資料中心 IP 區段', {
      ip: network.ip,
    });
  }
  if (network.tor) {
    push('server_tor_ip', 'high', '伺服器判定連線經 Tor 匿名網路', { ip: network.ip });
  } else if (network.vpn) {
    push('server_vpn_detected', 'medium', '伺服器判定連線經 VPN', { ip: network.ip });
  } else if (network.proxy) {
    push('server_proxy_detected', 'medium', '伺服器判定連線經 Proxy', { ip: network.ip });
  }
  if (network.dnsLeak?.detected) {
    push('server_dns_leak', 'medium', 'DNS 伺服器與預期 ISP 不一致', {
      dnsServers: network.dnsLeak.dnsServers,
      expectedIsp: network.dnsLeak.expectedIsp,
    });
  }
  if (network.webrtc.consistency === 'leak') {
    push('server_webrtc_leak', 'medium', 'WebRTC 公網 IP 與伺服器判定不一致', {
      publicIp: network.webrtc.publicIp,
      localIps: network.webrtc.localIps,
    });
  }
  return issues;
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
  const body = request.body as { label?: string; role?: AdminRoleValue };
  const callerRole = roleOfAuth(auth);
  const requested = body.role && ADMIN_ROLES.includes(body.role) ? body.role : callerRole;
  // 防止低權限金鑰自行升等：只能簽發不高於呼叫者角色的金鑰。
  if (requested !== callerRole && callerRole !== 'security_admin') {
    return reply.code(403).send({ error: 'forbidden', message: '只能簽發不高於自身角色的金鑰' });
  }
  const issued = await tenantService.issueApiKey(
    auth.tenant.tenantId,
    body.label ?? 'additional',
    requested,
  );
  await riskRepository.appendAuditLog({
    action: 'api-key-issued',
    tenantId: auth.tenant.tenantId,
    actorIp: requestIp(request),
    metadata: { keyId: issued.keyId, label: body.label ?? 'additional', role: requested, actorKeyId: auth.key.keyId },
  });
  return reply.code(201).send({ ...issued, role: requested, note: '明文僅此一次顯示。' });
});

/** 列出目前租戶的 API Key（不含明文與 hash）。 */
app.get('/v1/tenant/keys', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const keys = await tenantService.listApiKeys(auth.tenant.tenantId);
  return { keys };
});

/** 撤銷 API Key：撤銷後立即失效（冪等，重複撤銷回 200 與既有 revokedAt）。 */
app.post('/v1/tenant/keys/:keyId/revoke', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const { keyId } = request.params as { keyId: string };
  const target = await tenantService.getApiKey(auth.tenant.tenantId, keyId);
  if (!target) {
    return reply.code(404).send({ error: 'not_found', message: '查無此 API Key' });
  }
  if (!canAdminKey(roleOfRequest(request, auth), target.role)) {
    return reply
      .code(403)
      .send({ error: 'forbidden', message: '只能撤銷不高於自身角色的金鑰' });
  }
  const result = await tenantService.revokeApiKey(auth.tenant.tenantId, keyId);
  if (!result.found) {
    return reply.code(404).send({ error: 'not_found', message: '查無此 API Key' });
  }
  await riskRepository.appendAuditLog({
    action: 'api-key-revoked',
    tenantId: auth.tenant.tenantId,
    actorIp: requestIp(request),
    metadata: { keyId, label: target.label, role: target.role, actorKeyId: auth.key.keyId },
  });
  return { key: { keyId, label: target.label, revokedAt: result.revokedAt } };
});

/** 輪換 API Key：撤銷舊金鑰並簽發同角色新金鑰（明文僅回傳一次）。 */
app.post('/v1/tenant/keys/:keyId/rotate', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const { keyId } = request.params as { keyId: string };
  const target = await tenantService.getApiKey(auth.tenant.tenantId, keyId);
  if (!target) {
    return reply.code(404).send({ error: 'not_found', message: '查無此 API Key' });
  }
  if (target.revokedAt) {
    return reply.code(400).send({ error: 'key_revoked', message: '已撤銷的金鑰無法輪換，請直接簽發新金鑰' });
  }
  if (!canAdminKey(roleOfRequest(request, auth), target.role)) {
    return reply
      .code(403)
      .send({ error: 'forbidden', message: '只能輪換不高於自身角色的金鑰' });
  }
  const result = await tenantService.rotateApiKey(auth.tenant.tenantId, keyId);
  if (!result.found) {
    return reply.code(404).send({ error: 'not_found', message: '查無此 API Key' });
  }
  await riskRepository.appendAuditLog({
    action: 'api-key-rotated',
    tenantId: auth.tenant.tenantId,
    actorIp: requestIp(request),
    metadata: {
      oldKeyId: keyId,
      newKeyId: result.issued?.keyId,
      label: target.label,
      role: target.role,
      actorKeyId: auth.key.keyId,
    },
  });
  return reply
    .code(201)
    .send({ ...result.issued, role: result.role, revokedOldKeyId: keyId, note: '舊金鑰已撤銷；新金鑰明文僅此一次顯示。' });
});

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
  // 手動建立風險事件限 security_admin：避免租戶偽造證據鏈。
  if (roleOfRequest(request, auth) !== 'security_admin') {
    return reply.code(403).send({ error: 'forbidden', message: '手動建立風險事件限 security_admin' });
  }
  const body = request.body as unknown;
  const items = Array.isArray(body) ? body : [body];
  if (items.length === 0 || items.length > 200) {
    return reply.code(400).send({ error: 'invalid_payload' });
  }
  const events: RiskEvent[] = [];
  for (const item of items) {
    const result = validateRiskEvent(item);
    if (!result.ok) {
      return reply.code(400).send({ error: 'invalid_risk_event', issues: result.errors });
    }
    events.push({
      ...result.data,
      // tenantId 一律以服務端認證身分覆寫，不接受 client 自填（防偽造/跨租戶污染）。
      tenantId: auth.tenant.tenantId,
    });
  }
  await riskRepository.insertRiskEvents(events);
  await riskRepository.appendAuditLog({
    action: 'risk-events-manual',
    tenantId: auth.tenant.tenantId,
    metadata: { inserted: events.length },
  });
  return reply.code(201).send({ inserted: events.length });
});

app.get('/v1/public/config/:key', async (request, reply) => {
  const { key } = request.params as { key: string };
  // 未授權端點只能讀白名單內的公開 key。
  if (key !== 'homepage') {
    return reply.code(404).send({ error: 'config_not_found' });
  }
  const config = await riskRepository.getSiteConfig(key);
  return { config };
});

app.get('/v1/admin/configs/:key', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const { key } = request.params as { key: string };
  const config = await riskRepository.getSiteConfig(key);
  return { config };
});

app.put('/v1/admin/configs/:key', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  if (roleOfRequest(request, auth) !== 'security_admin') {
    return reply.code(403).send({ error: 'forbidden', message: '寫入站台設定限 security_admin' });
  }
  const { key } = request.params as { key: string };
  const body = request.body as { config?: unknown };
  if (body.config === undefined) return reply.code(400).send({ error: 'config_required' });
  await riskRepository.setSiteConfig(key, body.config);
  await riskRepository.appendAuditLog({
    action: 'site-config-update',
    tenantId: auth.tenant.tenantId,
    metadata: { key },
  });
  return { ok: true };
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
  const events = await riskRepository.listRiskEvents(auth.tenant.tenantId, {
    sessionId: query.sessionId,
    severity: query.severity,
    eventType: query.eventType as RiskEventType,
    limit: query.limit ? Math.max(1, Math.min(500, Number(query.limit))) : undefined,
  });
  return { events };
});

app.get('/v1/devices', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const query = request.query as { limit?: string };
  const limit = query.limit ? Math.max(1, Math.min(500, Number(query.limit))) : 100;
  const devices = await riskRepository.listDeviceFingerprints(auth.tenant.tenantId, limit);
  return { devices };
});

app.get('/v1/network/ip-reputation', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const query = request.query as { ip?: string };
  if (!query.ip) return reply.code(400).send({ error: 'ip_required' });
  const reputation = await riskRepository.getIpReputation(query.ip);
  return { reputation };
});

app.post('/v1/network/ip-reputation', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  if (roleOfRequest(request, auth) !== 'security_admin') {
    return reply.code(403).send({ error: 'forbidden', message: '寫入 IP 信譽限 security_admin' });
  }
  const body = request.body as {
    ipRange?: string;
    reputationScore?: number;
    categories?: string[];
    source?: string;
  };
  if (!body.ipRange || typeof body.reputationScore !== 'number') {
    return reply.code(400).send({ error: 'invalid_payload' });
  }
  const score = Math.max(0, Math.min(100, Math.round(body.reputationScore)));
  const reputation = {
    ipRange: body.ipRange,
    reputationScore: score,
    categories: Array.isArray(body.categories) ? body.categories.slice(0, 20) : [],
    source: body.source,
  };
  await riskRepository.upsertIpReputation(reputation);
  await riskRepository.appendAuditLog({
    action: 'ip-reputation-upsert',
    tenantId: auth.tenant.tenantId,
    targetIp: body.ipRange,
    metadata: { reputationScore: score },
  });
  return { ok: true, reputation };
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
  if (roleOfRequest(request, auth) !== 'security_admin') {
    return reply.code(403).send({ error: 'forbidden', message: '寫入欄位定義限 security_admin' });
  }
  const result = validateFieldDefinition(request.body);
  if (!result.ok) {
    return reply.code(400).send({ error: 'invalid_field_definition', issues: result.errors });
  }
  await riskRepository.upsertFieldDefinition(result.data);
  return { ok: true, definition: result.data };
});

const POLICY_VALUES = ['allow', 'review', 'challenge', 'limit', 'block', 'log_only'];
const REVIEW_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
type ReviewPriorityValue = (typeof REVIEW_PRIORITIES)[number];

app.post('/v1/reports/:id/review', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const { id } = request.params as { id: string };
  const report = await repository.getReport(auth.tenant.tenantId, id);
  if (!report) return reply.code(404).send({ error: 'report_not_found' });
  const body = request.body as {
    reason?: string;
    decision?: string;
    priority?: string;
    falsePositiveFlag?: boolean;
  };
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) {
    return reply.code(400).send({ error: 'reason_required' });
  }
  if (body.decision && !POLICY_VALUES.includes(body.decision)) {
    return reply.code(400).send({ error: 'invalid_decision' });
  }
  const priority: ReviewPriorityValue = (REVIEW_PRIORITIES as readonly string[]).includes(
    body.priority ?? '',
  )
    ? (body.priority as ReviewPriorityValue)
    : 'medium';
  const reviewCase = {
    caseId: crypto.randomUUID(),
    tenantId: auth.tenant.tenantId,
    sessionId: report.sessionId,
    reportId: report.reportId,
    riskEventIds: [],
    status: 'pending' as const,
    priority,
    openedAt: new Date().toISOString(),
    decision: body.decision as PolicyDecision | undefined,
    reason,
    falsePositiveFlag: body.falsePositiveFlag,
    appealStatus: 'none' as const,
  };
  await riskRepository.createReviewCase(reviewCase);
  await riskRepository.appendAuditLog({
    action: 'review-open',
    tenantId: auth.tenant.tenantId,
    actorIp: requestIp(request),
    metadata: { reportId: report.reportId, caseId: reviewCase.caseId, reason },
  });
  return reply.code(201).send({ case: reviewCase });
});

app.get('/v1/review-cases', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const query = request.query as { status?: string; limit?: string };
  const cases = await riskRepository.listReviewCases(auth.tenant.tenantId, {
    status: query.status as ReviewStatus | undefined,
    limit: query.limit ? Math.max(1, Math.min(500, Number(query.limit))) : undefined,
  });
  return { cases };
});

app.put('/v1/review-cases/:caseId', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const { caseId } = request.params as { caseId: string };
  const body = request.body as {
    status?: string;
    decision?: string;
    reason?: string;
    falsePositiveFlag?: boolean;
  };
  const updated = await riskRepository.updateReviewCase(auth.tenant.tenantId, caseId, {
    status: body.status as ReviewStatus | undefined,
    decision: body.decision as PolicyDecision | undefined,
    reason: body.reason,
    reviewerId: auth.tenant.tenantId,
    falsePositiveFlag: body.falsePositiveFlag,
    closedAt: body.status === 'closed' || body.status === 'reviewed' ? new Date().toISOString() : undefined,
  });
  if (!updated) return reply.code(404).send({ error: 'review_case_not_found' });
  await riskRepository.appendAuditLog({
    action: 'review-decision',
    tenantId: auth.tenant.tenantId,
    actorIp: requestIp(request),
    metadata: { caseId, decision: updated.decision, status: updated.status },
  });
  return { ok: true, case: updated };
});

app.post('/v1/review-cases/:caseId/appeal', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const { caseId } = request.params as { caseId: string };
  const existing = await riskRepository.getReviewCase(auth.tenant.tenantId, caseId);
  if (!existing) return reply.code(404).send({ error: 'review_case_not_found' });
  const body = request.body as { reason?: string };
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) return reply.code(400).send({ error: 'reason_required' });
  const appeal = {
    appealId: crypto.randomUUID(),
    caseId,
    reason,
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
  };
  await riskRepository.createAppeal(appeal);
  return reply.code(201).send({ appeal });
});

app.post('/v1/reports', async (request, reply) => {
  const validation = validateEnvironmentReport(request.body);
  if (!validation.ok) return validationReply(reply, validation);

  const ip = requestIp(request);
  const report: EnvironmentReport = validation.data;
  const auth = await resolveAuth(request);
  // 服務端永遠以認證身分覆寫 tenantId；匿名上送即平台公共資料（NULL）。
  report.tenantId = auth?.tenant.tenantId;

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
  // 伺服器事實一併進入評分與證據鏈（不信任客戶端自報為唯一規則來源）。
  const serverIssues = serverNetworkIssues(network);
  const allIssues = [...(report.issues ?? []), ...serverIssues];
  report.issues = allIssues;
  const score = await buildScoringEngine().calculate(report, allIssues, DEFAULT_PROFILE);
  const policy = scoreToPolicy(score);

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

  // 規則命中 → 自動 RiskEvent（證據鏈）；高風險自動開人工複核 case 並回填事件。
  const events = eventsFromScore(report, score);
  if (events.length > 0) {
    await riskRepository.insertRiskEvents(events);
  }
  if (score.riskLevel === 'high' || score.riskLevel === 'critical') {
    await riskRepository.createReviewCase({
      caseId: crypto.randomUUID(),
      tenantId: report.tenantId,
      sessionId: report.sessionId,
      reportId: report.reportId,
      riskEventIds: events.map((event) => event.eventId),
      status: 'pending',
      priority: score.riskLevel === 'critical' ? 'urgent' : 'high',
      openedAt: new Date().toISOString(),
      reason: `自動開啟審查：risk_level=${score.riskLevel}（規則命中 ${events.length} 項），需人工複核後再決定是否封鎖`,
      appealStatus: 'none',
    });
  }

  // /v1/devices 資料接線：僅具身分租戶的收案寫入設備指紋與網路訊號。
  // 匿名（tenant NULL）不寫入，維持「租戶資料 vs 公開資料」的 owner 邊界。
  if (auth) {
    const device = buildDeviceFingerprint(report, auth.tenant.tenantId);
    if (device) {
      await riskRepository.upsertDeviceFingerprint(device);
    }
    await riskRepository.upsertNetworkSignal(buildNetworkSignal(report, auth.tenant.tenantId, ip, network));
  }

  if (auth) {
    await tenantService.recordUsage(auth.tenant.tenantId, 1, 'report');
  }

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

app.get('/v1/reports', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const role = roleOfRequest(request, auth);
  const query = request.query as { limit?: string };
  const limit = query.limit ? Math.max(1, Math.min(200, Number(query.limit))) : 50;
  const reports = (await repository.listReportsByTenant(auth.tenant.tenantId, limit)).map(
    (report) => maskStoredReport(report, role),
  );
  return { tenantId: auth.tenant.tenantId, reports };
});

app.get('/v1/stats/scans', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const tenantCount = await repository.countReports(auth.tenant.tenantId);
  const platformCount = await repository.countReports();
  return { tenantCount, platformCount };
});

app.get('/v1/reports/:id', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const role = roleOfRequest(request, auth);
  const { id } = request.params as { id: string };
  const stored = await repository.getReport(auth.tenant.tenantId, id);
  if (!stored) return reply.code(404).send({ error: 'report_not_found' });
  return maskStoredReport(stored, role);
});

app.delete('/v1/reports/:id', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const { id } = request.params as { id: string };
  const deleted = await repository.deleteReport(auth.tenant.tenantId, id);
  if (!deleted) return reply.code(404).send({ error: 'report_not_found' });
  await riskRepository.appendAuditLog({
    action: 'report-delete',
    tenantId: auth.tenant.tenantId,
    targetIp: requestIp(request),
    actorIp: requestIp(request),
    metadata: { reportId: id },
  });
  return reply.code(204).send();
});

app.get('/v1/visitors/:visitorId/reports', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const { visitorId } = request.params as { visitorId: string };
  const reports = await repository.listReportsByVisitor(auth.tenant.tenantId, visitorId);
  const visitor = await repository.getVisitor(auth.tenant.tenantId, visitorId);
  return { visitorId, visitor, reports };
});

app.delete('/v1/visitors/:visitorId', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const { visitorId } = request.params as { visitorId: string };
  const deleted = await repository.deleteVisitor(auth.tenant.tenantId, visitorId);
  if (!deleted) return reply.code(404).send({ error: 'visitor_not_found' });
  await riskRepository.appendAuditLog({
    action: 'visitor-delete',
    tenantId: auth.tenant.tenantId,
    targetIp: requestIp(request),
    actorIp: requestIp(request),
    metadata: { visitorId },
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
  await riskRepository.appendAuditLog({
    action: 'port-scan',
    targetIp: ip,
    actorIp: ip,
    metadata: { ports: sanitized },
  });

  const results = await scanPorts(ip, sanitized.length > 0 ? sanitized : [22]);
  app.log.info({ ip, ports: sanitized }, 'port scan completed');
  return { ip, results, auditId: auditLog.length };
});

app.get('/v1/audit-logs', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const query = request.query as { limit?: string };
  const limit = query.limit ? Math.max(1, Math.min(500, Number(query.limit))) : 100;
  const logs = await riskRepository.listAuditLogs(auth.tenant.tenantId, limit);
  return { logs };
});

app.get('/v1/plugin-profile', async (_request, reply) => {
  reply.code(501).send({ error: 'not_implemented', message: 'Plugin Registry 尚未接入' });
});

/* ------------------------------------------------------------------ */
/* 保留期清理 job（code review P1）：定時刪除已過期報告                   */
/* ------------------------------------------------------------------ */

/**
 * 啟動保留期清理：僅在接 Postgres（DATABASE_URL）時生效；in-memory（測試/無 URL）不啟動。
 * 可用 ENABLE_EXPIRY_CLEANUP=0 停用、EXPIRY_CLEANUP_INTERVAL_MS 調整間隔（預設 6 小時）。
 * timer.unref()：不阻擋 process 結束（與現行無 graceful shutdown 的結構相容）。
 */
function startExpiryCleanup(): void {
  if ((process.env.ENABLE_EXPIRY_CLEANUP ?? '1') === '0') return;
  if (!databaseUrl) return; // in-memory 儲存無 expires_at 語意，跳過
  const intervalMs = Math.max(
    60_000,
    Number(process.env.EXPIRY_CLEANUP_INTERVAL_MS ?? 6 * 60 * 60 * 1000),
  );
  const run = async () => {
    try {
      const deleted = await repository.deleteExpiredReports(new Date().toISOString());
      if (deleted > 0) app.log.info({ deleted }, 'expired reports purged');
    } catch (err) {
      app.log.error({ err }, 'expiry cleanup job failed');
    }
  };
  void run();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
}

startExpiryCleanup();

app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
