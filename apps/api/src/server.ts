import { createHash, createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  ADMIN_PAGE_KEYS,
  ADMIN_PAGES,
  BLOCK_REGISTRY,
  SCHEMA_VERSION,
  type AnalysisIssue,
  type EnvironmentReport,
  type PolicyDecision,
  defaultSettingsFor,
  listPageBlocks,
  policyDecisionForRiskLevel,
  type ReviewStatus,
  type RiskEvent,
  type RiskEventType,
  validateBlockSettings,
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
  type FingerprintByIpRow,
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

// 統一錯誤處理：限流逾限 → 429（其餘維持 5xx/原狀態碼語意）。
app.setErrorHandler((err, request, reply) => {
  const code = (err as Error & { code?: string }).code;
  if (code === 'RATE_LIMITED') {
    return reply
      .code(429)
      .header('Retry-After', '60')
      .send({ error: 'rate_limited', message: 'API Key 限流：每分鐘 60 次，請稍後重試', retryAfterSeconds: 60 });
  }
  app.log.error({ err, url: request.url }, 'unhandled error');
  const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
  return reply.code(statusCode).send({ error: 'internal_error', message: '伺服器內部錯誤' });
});

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

/** 是否為環回/私網/保留網段（或無法解析的位址）；供來源信任與 Webhook 目標防護共用。 */
function isPrivateAddress(ip: string): boolean {
  const v = (ip ?? '').trim().toLowerCase();
  if (!v || v === 'unknown') return true;
  if (v === '::1' || v === '::') return true;
  if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
  if (v.includes(':')) {
    // IPv6：fc00::/7 (ULA)、fe80::/10 (link-local)、::1/:: 已於上處理。
    return /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  }
  const parts = v.split('.');
  if (parts.length !== 4) return true;
  const nums = parts.map(Number);
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const a = nums[0];
  const b = nums[1];
  if (a === undefined || b === undefined) return true;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local / metadata(169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true; // 多播/保留
  return false;
}

/** 信任的 proxy 網段（可含 IPv4 清單，例如 Caddy 所在網段）。 */
const TRUSTED_PROXY_IPS = (process.env.TRUSTED_PROXY_IPS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isTrustedPeer(remote: string): boolean {
  const cleaned = (remote ?? '').replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1');
  if (TRUSTED_PROXY_IPS.includes(cleaned)) return true;
  // 預設信任本機與內網來源（docker compose 內 reverse proxy 常見），
  // 網際網路來源一律不採信其 X-Forwarded-For。
  return cleaned === '127.0.0.1' || isPrivateAddress(cleaned) === true;
}

function requestIp(request: {
  headers: Record<string, unknown>;
  socket: { remoteAddress?: string };
}): string {
  const remote = request.socket.remoteAddress ?? 'unknown';
  const cleaned = remote.replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1');
  const forwarded = request.headers['x-forwarded-for'];
  if (isTrustedPeer(cleaned) && typeof forwarded === 'string' && forwarded.trim()) {
    const first = forwarded.split(',')[0]?.trim() ?? '';
    // 僅採信「合法且非保留」的位址；其餘（畸形/私網偽造）一律退回 socket 來源。
    if (first && !isPrivateAddress(first)) return first;
  }
  return cleaned;
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
  if (attempts.length >= 60) {
    // 限流 ≠ 未授權：由 setErrorHandler 回 429（含 Retry-After）。
    const err = new Error('API Key rate limit exceeded') as Error & { code?: string; statusCode?: number };
    err.code = 'RATE_LIMITED';
    err.statusCode = 429;
    throw err;
  }
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

/** 單次投遞：解析目標主機防 DNS-rebinding/私網，禁 redirect，附 HMAC 簽章。 */
async function deliverWebhook(
  webhook: Webhook,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const parsed = new URL(webhook.url);
  const host = parsed.hostname;
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!isLoopback) {
    let addrs: Array<{ address: string }> = [];
    try {
      addrs = await lookup(host, { all: true });
    } catch {
      app.log.warn({ webhook: webhook.id, host }, 'webhook dns lookup failed');
      return false;
    }
    if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
      app.log.warn({ webhook: webhook.id, host, addrs }, 'webhook target resolved to private/reserved IP');
      return false;
    }
  }
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'idempotency-key': crypto.randomUUID(),
  };
  if (signingSecret) {
    headers['x-shieldscan-signature'] =
      'sha256=' + createHmac('sha256', signingSecret).update(body).digest('hex');
  }
  const response = await fetch(webhook.url, {
    method: 'POST',
    headers,
    body,
    redirect: 'error', // 拒絕跟隨任何重導，避免 SSRF 跳板。
    signal: AbortSignal.timeout(3000),
  });
  return response.ok;
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
      eventId: crypto.randomUUID(),
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
        if (await deliverWebhook(webhook, payload)) break;
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
  server_ip_velocity: 'ip_velocity_anomaly',
  server_header_incoherence: 'header_incoherence',
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

/** 語言對照：國家(ISO code/常用名) → 主要語言前綴（僅用於一致性粗判）。 */
const COUNTRY_LANG: Record<string, string> = {
  TW: 'zh', CN: 'zh', HK: 'zh', MO: 'zh', SG: 'en',
  US: 'en', GB: 'en', AU: 'en', CA: 'en', IE: 'en', NZ: 'en',
  JP: 'ja', KR: 'ko', VN: 'vi', TH: 'th', ID: 'id', MY: 'ms', PH: 'tl',
  DE: 'de', FR: 'fr', NL: 'nl', IT: 'it', ES: 'es', PT: 'pt', RU: 'ru',
  TR: 'tr', PL: 'pl', SE: 'sv', NO: 'no', FI: 'fi', DK: 'da', CZ: 'cs',
};
const COUNTRY_LANG_BYNAME: Record<string, string> = {
  taiwan: 'zh', china: 'zh', 'hong kong': 'zh', macau: 'zh', singapore: 'en',
  'united states': 'en', 'united kingdom': 'en', australia: 'en', japan: 'ja',
  'south korea': 'ko', vietnam: 'vi', thailand: 'th', indonesia: 'id',
  malaysia: 'ms', philippines: 'tl', germany: 'de', france: 'fr', netherlands: 'nl',
};

function tzOffsetMinutesOf(timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date());
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
    if (!match) return null;
    const sign = match[1] === '-' ? -1 : 1;
    const hh = Number(match[2]);
    const mm = match[3] ? Number(match[3]) : 0;
    return sign * (hh * 60 + mm);
  } catch {
    return null;
  }
}

function isPublicIpV4(ip?: string): boolean {
  if (!ip) return false;
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = nums;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a >= 224) return false;
  return true;
}

/**
 * 環境一致性 issues（對齊 whoer/browserscan 的扣分面，縮小分數落差）：
 * Canvas 停用、瀏覽器時區 vs IP 時區、瀏覽器語言 vs IP 國家語言、WebRTC 公網 vs HTTP IP。
 * 全部由「伺服器事實 + 訊號」判定，不信任客戶端自報。
 */
function environmentalCoherenceIssues(
  report: EnvironmentReport,
  network: NetworkAnalysis,
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const push = (
    type: string,
    severity: AnalysisIssue['severity'],
    description: string,
    evidence: Record<string, unknown>,
  ): void => {
    issues.push({ id: crypto.randomUUID(), type, severity, description, evidence });
  };
  const valueOf = (key: string): Record<string, unknown> | undefined => {
    const s = report.signals.find((sig) => sig.key === key);
    return s && typeof s.value === 'object' && s.value !== null
      ? (s.value as Record<string, unknown>)
      : undefined;
  };

  const canvas = valueOf('canvas');
  if (canvas && canvas.supported === false) {
    push('canvas_disabled', 'medium', 'Canvas API 不支援或停用（環境極異常或隱私保護過度）', {
      supported: false,
    });
  }

  const tz = valueOf('timezone');
  const browserTz = typeof tz?.timezone === 'string' ? tz.timezone : undefined;
  const ipTz = network.geo?.timezone;
  if (browserTz && ipTz && browserTz.toLowerCase() !== ipTz.toLowerCase()) {
    const browserOffset =
      typeof tz?.offsetHours === 'number' && Number.isFinite(tz.offsetHours)
        ? Math.round(tz.offsetHours) * 60
        : null;
    const ipOffset = tzOffsetMinutesOf(ipTz);
    if (browserOffset === null || ipOffset === null || browserOffset !== ipOffset) {
      push(
        'timezone_mismatch',
        'warning',
        '瀏覽器時區與 IP 所在時區不一致（疑似使用代理或更改時區）',
        { browserTimeZone: browserTz, ipTimeZone: ipTz, browserOffsetMinutes: browserOffset, ipOffsetMinutes: ipOffset },
      );
    }
  }

  const locale = valueOf('locale');
  const rawLang = Array.isArray(locale?.languages) && locale?.languages.length
    ? String(locale.languages[0])
    : typeof locale?.language === 'string'
      ? locale.language
      : '';
  const geo = network.geo as { countryCode?: string; country?: string } | null | undefined;
  const expected =
    COUNTRY_LANG[(geo?.countryCode ?? '').toUpperCase()] ??
    COUNTRY_LANG_BYNAME[(geo?.country ?? '').toLowerCase()] ??
    '';
  if (expected && rawLang && !rawLang.toLowerCase().startsWith(expected)) {
    push(
      'language_mismatch',
      'warning',
      '瀏覽器語言與 IP 所在國家常用語言不一致（疑似試圖隱藏實際位置）',
      { language: rawLang, expectedPrefix: expected, country: geo?.country },
    );
  }

  const httpIp = network.ip;
  const webrtcIp = network.webrtc?.publicIp;
  if (
    isPublicIpV4(httpIp) &&
    isPublicIpV4(webrtcIp) &&
    httpIp !== webrtcIp
  ) {
    push(
      'webrtc_ip_mismatch',
      'warning',
      'WebRTC 公網 IP 與伺服器連線 IP 不同（疑似 IP 隱藏或分流不一致）',
      { httpIp, webrtcIp },
    );
  }

  return issues;
}

/**
 * 請求標頭一致性校驗（WP4，伺服器獨立判定）：以 server.httpHeaders 訊號
 * （node-sdk collectServerSignals 收的原始 headers）檢查
 *  1) UA 非一般瀏覽器（無頭/程式客戶端）→ server_bot_suspected
 *  2) UA OS 與 sec-ch-ua-platform 矛盾、或 sec-ch-ua 品牌與 UA 矛盾 → server_header_incoherence
 * 不信任客戶端自報的解析結果。
 */
function headerCoherenceIssues(report: EnvironmentReport): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const hh = report.signals.find((s) => s.key === 'httpHeaders')?.value as
    | {
        userAgent?: string;
        acceptLanguage?: string;
        secChUa?: string;
        secChUaPlatform?: string;
      }
    | undefined;
  if (!hh) return issues;
  const uaText = String(hh.userAgent ?? '');
  const push = (
    type: string,
    severity: AnalysisIssue['severity'],
    description: string,
    evidence: Record<string, unknown>,
  ): void => {
    issues.push({ id: crypto.randomUUID(), type, severity, description, evidence });
  };

  const headless = /HeadlessChrome|PhantomJS|python-requests|curl\/|wget\/|axios|node-fetch/i.test(uaText);
  const notBrowser = !/Mozilla/i.test(uaText) && uaText.trim().length > 0;
  if (uaText.trim().length === 0 || headless || notBrowser) {
    push('server_bot_suspected', 'high', '伺服器判定 User-Agent 非一般瀏覽器（無頭/程式客戶端）', {
      userAgent: uaText.slice(0, 120),
    });
    return issues;
  }

  const platform = String(hh.secChUaPlatform ?? '');
  const uaOs = /Android/i.test(uaText)
    ? 'Android'
    : /Windows/i.test(uaText)
      ? 'Windows'
      : /iPhone|iPad/i.test(uaText)
        ? 'iOS'
        : /Macintosh|Mac OS X/i.test(uaText)
          ? 'macOS'
          : /Linux/i.test(uaText)
            ? 'Linux'
            : '';
  if (platform && uaOs && platform !== uaOs) {
    push('server_header_incoherence', 'medium', 'UA 宣稱 OS 與 Client Hints 平台不符（伺服器獨立判定）', {
      uaOs,
      clientHintsPlatform: platform,
    });
  }
  if (hh.secChUa && /"Google Chrome"/.test(hh.secChUa) && uaText && !/Chrome/i.test(uaText)) {
    push('server_header_incoherence', 'medium', 'sec-ch-ua 宣稱 Chrome 但 UA 無 Chrome 標記', {
      secChUa: hh.secChUa.slice(0, 120),
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
    actorKeyId: auth.key.keyId,
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
    actorKeyId: auth.key.keyId,
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
    actorKeyId: auth.key.keyId,
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
  const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
  let parsed: URL | null = null;
  try {
    parsed = new URL(rawUrl);
  } catch {
    parsed = null;
  }
  const allowLocalHttp = process.env.WEBHOOK_ALLOW_LOCALHOST === '1';
  const host = parsed?.hostname ?? '';
  const isLoopbackHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const schemeOk = parsed?.protocol === 'https:' || (allowLocalHttp && parsed?.protocol === 'http:' && isLoopbackHost);
  if (!parsed || !schemeOk) {
    return reply
      .code(400)
      .send({ error: 'invalid_url', message: 'Webhook 必須為 https URL（本地測試需設 WEBHOOK_ALLOW_LOCALHOST=1）' });
  }
  if (!isLoopbackHost) {
    let addrs: Array<{ address: string }> = [];
    try {
      addrs = await lookup(host, { all: true });
    } catch {
      return reply.code(400).send({ error: 'invalid_url', message: 'Webhook 主機無法解析' });
    }
    if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
      return reply.code(400).send({ error: 'invalid_url', message: 'Webhook 主機不得指向內網/保留網段' });
    }
  }
  const webhook: Webhook = {
    id: crypto.randomUUID(),
    tenantId: auth.tenant.tenantId,
    url: rawUrl,
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
    actorKeyId: auth.key.keyId,
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
    actorKeyId: auth.key.keyId,
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

/** M2 圖譜：某 IP 在時窗內出現過的裝置（ip → devices 邊）。 */
app.get('/v1/devices/by-ip', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const query = request.query as { ip?: string; days?: string };
  if (!query.ip) return reply.code(400).send({ error: 'ip_required' });
  const days = Math.max(1, Math.min(90, Number(query.days ?? 30)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const fingerprints = await repository.listFingerprintsByIp(
    auth.tenant.tenantId,
    query.ip,
    since,
  );
  return { ip: query.ip, windowDays: days, fingerprints };
});

/** M2 圖譜：裝置關聯視圖（sessions / IP 使用 / 帳號 / 同 IP 其他裝置）。 */
app.get('/v1/devices/:hash/relations', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const { hash } = request.params as { hash: string };
  const query = request.query as { days?: string };
  const days = Math.max(1, Math.min(90, Number(query.days ?? 30)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const sessions = await repository.listSessionsByFingerprint(
    auth.tenant.tenantId,
    hash,
    since,
  );

  const ipUsage = new Map<string, number>();
  const accountUsage = new Map<string, number>();
  for (const session of sessions) {
    if (session.clientIp) ipUsage.set(session.clientIp, (ipUsage.get(session.clientIp) ?? 0) + 1);
    accountUsage.set(session.visitorId, (accountUsage.get(session.visitorId) ?? 0) + 1);
  }
  const ipCounts = [...ipUsage.entries()]
    .map(([ip, count]) => ({ ip, count }))
    .sort((a, b) => b.count - a.count);
  const accounts = [...accountUsage.entries()]
    .map(([visitorId, count]) => ({ visitorId, count }))
    .sort((a, b) => b.count - a.count);

  // 同 IP 的其他裝置（圖譜邊，最多巡 8 個使用過的 IP）
  const peersByIp: Array<{ ip: string; fingerprints: FingerprintByIpRow[] }> = [];
  for (const { ip } of ipCounts.slice(0, 8)) {
    const rows = await repository.listFingerprintsByIp(auth.tenant.tenantId, ip, since, 10);
    const others = rows.filter((row) => row.fingerprintHash !== hash);
    if (others.length > 0) peersByIp.push({ ip, fingerprints: others });
  }

  const deviceStats = await riskRepository.getDeviceFingerprint(hash);
  return {
    device: { fingerprintHash: hash, stats: deviceStats ?? null },
    windowDays: days,
    totals: { sessions: sessions.length, distinctIps: ipCounts.length, distinctAccounts: accounts.length },
    sessions: sessions.slice(0, 50),
    ipUsage: ipCounts,
    accounts,
    peersByIp,
  };
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
    actorKeyId: auth.key.keyId,
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
    actorKeyId: auth.key.keyId,
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
    actorKeyId: auth.key.keyId,
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

const OUTCOME_TYPES = [
  'fraud_chargeback',
  'fraud_order',
  'false_positive',
  'appeal_accepted',
  'appeal_rejected',
  'decision_log',
] as const;

/** 成效回饋（WP3）：客戶回報事後結果（詐欺拒付/詐欺訂單/誤殺/申訴成立）或 shadow 決策記錄。 */
app.post('/v1/outcomes', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const body = request.body as {
    outcomeType?: string;
    reportId?: string;
    caseId?: string;
    sessionId?: string;
    decision?: string;
    shadow?: boolean;
    amount?: number;
    occurredAt?: string;
  };
  if (!body.outcomeType || !(OUTCOME_TYPES as readonly string[]).includes(body.outcomeType)) {
    return reply.code(400).send({ error: 'invalid_outcome_type', allowed: OUTCOME_TYPES });
  }
  if (body.decision && !POLICY_VALUES.includes(body.decision)) {
    return reply.code(400).send({ error: 'invalid_decision' });
  }
  const amount =
    typeof body.amount === 'number' && Number.isFinite(body.amount) ? Math.max(0, body.amount) : undefined;
  const outcome = {
    id: crypto.randomUUID(),
    tenantId: auth.tenant.tenantId,
    reportId: body.reportId,
    caseId: body.caseId,
    sessionId: body.sessionId,
    outcomeType: body.outcomeType as (typeof OUTCOME_TYPES)[number],
    decision: body.decision as PolicyDecision | undefined,
    shadow: body.shadow === true,
    amount,
    occurredAt: body.occurredAt ?? new Date().toISOString(),
  };
  await riskRepository.recordOutcome(outcome);
  await riskRepository.appendAuditLog({
    action: 'outcome-recorded',
    tenantId: auth.tenant.tenantId,
    actorKeyId: auth.key.keyId,
    actorIp: requestIp(request),
    metadata: { outcomeType: outcome.outcomeType, shadow: outcome.shadow, amount },
  });
  return reply.code(201).send({ outcome });
});

/** ROI 聚合（WP3）：潛在攔截詐欺、誤殺回饋、shadow 反事實統計（租戶隔離）。 */
app.get('/v1/roi', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const query = request.query as { since?: string; until?: string };
  const until = query.until ?? new Date().toISOString();
  const since = query.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const outcomes = await riskRepository.listOutcomes(auth.tenant.tenantId, since, until);

  const fraud = outcomes.filter(
    (o) => o.outcomeType === 'fraud_chargeback' || o.outcomeType === 'fraud_order',
  );
  const enforcedBlocking = ['block', 'challenge', 'review', 'limit'];
  const prevented = fraud.filter(
    (o) => o.shadow !== true && o.decision && enforcedBlocking.includes(o.decision),
  );
  const preventedAmount = prevented.reduce((sum, o) => sum + (o.amount ?? 0), 0);
  const shadowLogs = outcomes.filter((o) => o.outcomeType === 'decision_log' && o.shadow === true);
  const falsePositives = outcomes.filter(
    (o) => o.outcomeType === 'false_positive' || o.outcomeType === 'appeal_accepted',
  );
  const judged = fraud.length + falsePositives.length;
  return {
    window: { since, until },
    totals: { outcomeCount: outcomes.length, fraudEvents: fraud.length },
    prevented: {
      count: prevented.length,
      estimatedAmount: Math.round(preventedAmount * 100) / 100,
      note: '詐欺事件中當時決策為 block/challenge/review 者（enforced，非 shadow）',
    },
    shadow: {
      decisionLogCount: shadowLogs.length,
      note: 'shadowMode 下的高風險反事實決策（would-action）',
    },
    falsePositives: {
      count: falsePositives.length,
      falsePositiveRate: judged > 0 ? Math.round((falsePositives.length / judged) * 1000) / 10 : 0,
    },
  };
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
  // 具身分租戶的收案：計算裝置指紋（供落庫/IP 速度/設備表共用，避免重算）。
  const deviceForScope = auth ? buildDeviceFingerprint(report, auth.tenant.tenantId) : null;
  // 伺服器事實一併進入評分與證據鏈（不信任客戶端自報為唯一規則來源）。
  const serverIssues = serverNetworkIssues(network);
  const velocityIssues: AnalysisIssue[] = [];
  if (auth && deviceForScope) {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recentIps = await repository.listRecentClientIps(
      auth.tenant.tenantId,
      deviceForScope.fingerprintHash,
      since7d,
    );
    if (recentIps.length >= 6) {
      velocityIssues.push({
        id: crypto.randomUUID(),
        type: 'server_ip_velocity_anomaly',
        severity: 'medium',
        description: `同裝置近 7 天內由 ${recentIps.length} 個不同 IP 連線（IP 速度異常）`,
        evidence: { ipCount7d: recentIps.length, ips: recentIps.slice(0, 30) },
      });
    }
  }
  const allIssues = [
    ...(report.issues ?? []),
    ...serverIssues,
    ...velocityIssues,
    ...headerCoherenceIssues(report),
    ...environmentalCoherenceIssues(report, network),
  ];
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
    fingerprintHash: deviceForScope?.fingerprintHash,
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

  // WP3 Shadow：site_configs.shadowMode 啟用時，把高風險決策記為反事實 decision_log
  // （平台本就「只記錄不自動封鎖」；shadow 開啟 = 額外留下 would-action 供 ROI 計算）。
  if (auth && (score.riskLevel === 'high' || score.riskLevel === 'critical')) {
    const shadowCfg = await riskRepository.getSiteConfig('shadowMode');
    if ((shadowCfg as { enabled?: boolean } | null)?.enabled === true) {
      await riskRepository.recordOutcome({
        id: crypto.randomUUID(),
        tenantId: auth.tenant.tenantId,
        reportId: report.reportId,
        sessionId: report.sessionId,
        outcomeType: 'decision_log',
        decision: policy,
        shadow: true,
        occurredAt: new Date().toISOString(),
        metadata: { riskLevel: score.riskLevel, finalScore: score.finalScore, events: events.length },
      });
    }
  }

  // /v1/devices 資料接線：僅具身分租戶的收案寫入設備指紋與網路訊號。
  // 匿名（tenant NULL）不寫入，維持「租戶資料 vs 公開資料」的 owner 邊界。
  if (auth && deviceForScope) {
    await riskRepository.upsertDeviceFingerprint(deviceForScope);
    await riskRepository.upsertNetworkSignal(buildNetworkSignal(report, auth.tenant.tenantId, ip, network));
  }

  if (auth) {
    await tenantService.recordUsage(auth.tenant.tenantId, 1, 'report');
  }

  // 基準分布（數位黃金 Step2）：每筆掃描寫入事實維度＋命中規則，供聚合（失敗不阻擋收案）。
  try {
    const tzSignal = report.signals.find((s) => s.key === 'timezone')?.value as
      | { offsetHours?: number }
      | undefined;
    const geoDim = network.geo as { country?: string; asn?: string } | null | undefined;
    const rulesHit = [
      ...new Set([
        ...(score.explanations ?? []).map((e) => e.ruleId),
        ...(report.issues ?? []).map((i) => i.type),
      ]),
    ].slice(0, 30);
    await riskRepository.insertReportFact({
      reportId: report.reportId,
      tenantId: report.tenantId,
      country: geoDim?.country,
      asn: geoDim?.asn,
      tzOffset:
        typeof tzSignal?.offsetHours === 'number' && Number.isFinite(tzSignal.offsetHours)
          ? Math.round(tzSignal.offsetHours)
          : null,
      rulesHit,
    });
  } catch (err) {
    app.log.warn({ err }, 'report_fact insert failed (non-fatal)');
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
    actorKeyId: auth.key.keyId,
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
    actorKeyId: auth.key.keyId,
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

/* ------------------------------------------------------------------ */
/* Phase A 版面 API（dashboard_blocks；tenant 隔離；寫入限 security_admin）*/
/* ------------------------------------------------------------------ */

interface StoredBlockLite {
  blockKey: string;
  enabled: boolean;
  position: number;
  settings: Record<string, unknown>;
  persisted: boolean;
}

function mergedBlocks(
  defs: ReturnType<typeof listPageBlocks>,
  stored: Map<string, StoredBlockLite>,
): Array<{
  blockKey: string;
  icon: string;
  title: string;
  description: string;
  enabled: boolean;
  position: number;
  settings: Record<string, unknown>;
  defaultEnabled: boolean;
  accessLevel: 'normal' | 'restricted';
  persisted: boolean;
}> {
  return defs
    .map((def) => {
      const row = stored.get(def.key);
      return {
        blockKey: def.key,
        icon: def.icon,
        title: def.title,
        description: def.description,
        enabled: row ? row.enabled : def.defaultEnabled,
        position: row ? row.position : def.defaultPosition,
        settings: row ? row.settings : defaultSettingsFor(def),
        defaultEnabled: def.defaultEnabled,
        accessLevel: def.accessLevel,
        persisted: Boolean(row),
      };
    })
    .sort((a, b) => a.position - b.position || a.blockKey.localeCompare(b.blockKey));
}

async function loadStoredBlocks(tenantId: string): Promise<Map<string, StoredBlockLite>> {
  const rows = await riskRepository.listDashboardBlocks(tenantId);
  return new Map(rows.map((r) => [r.blockKey, { ...r, persisted: true }]));
}

/** 讀取版面：可帶 ?page=，否則回傳全部頁面（區塊未覆寫時以 registry 預設合併）。 */
app.get('/v1/dashboard/blocks', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  const query = request.query as { page?: string };
  const stored = await loadStoredBlocks(auth.tenant.tenantId);

  if (query.page) {
    if (!(ADMIN_PAGE_KEYS as readonly string[]).includes(query.page)) {
      return reply.code(400).send({ error: 'invalid_page', message: '未知後台頁面' });
    }
    const page = query.page as (typeof ADMIN_PAGE_KEYS)[number];
    return {
      tenantId: auth.tenant.tenantId,
      pages: [
        {
          key: page,
          title: ADMIN_PAGES[page].title,
          icon: ADMIN_PAGES[page].icon,
          blocks: mergedBlocks(listPageBlocks(page), stored),
        },
      ],
    };
  }
  const pages = ADMIN_PAGE_KEYS.map((page) => ({
    key: page,
    title: ADMIN_PAGES[page].title,
    icon: ADMIN_PAGES[page].icon,
    blocks: mergedBlocks(listPageBlocks(page), stored),
  }));
  return { tenantId: auth.tenant.tenantId, pages };
});

/** 覆寫單一區塊（啟停/順序/設定）。settings 依 registry schema 驗證。 */
app.put('/v1/dashboard/blocks/:blockKey', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  if (roleOfRequest(request, auth) !== 'security_admin') {
    return reply.code(403).send({ error: 'forbidden', message: '版面寫入限 security_admin' });
  }
  const { blockKey } = request.params as { blockKey: string };
  const def = BLOCK_REGISTRY[blockKey];
  if (!def) {
    return reply.code(404).send({ error: 'unknown_block', message: `未知區塊：${blockKey}` });
  }
  const body = (request.body ?? {}) as {
    enabled?: unknown;
    position?: unknown;
    settings?: unknown;
    changedKeys?: string[];
  };

  const stored = await loadStoredBlocks(auth.tenant.tenantId);
  const row = stored.get(blockKey);
  const defaults = defaultSettingsFor(def);
  const merged = {
    ...defaults,
    ...(row?.settings ?? {}),
    ...(body.settings && typeof body.settings === 'object' ? body.settings : {}),
  };
  const validated = validateBlockSettings(blockKey, merged);
  if (!validated.ok) {
    return reply.code(400).send({
      error: 'invalid_settings',
      issues: validated.issues,
      message: '設定驗證失敗（僅接受純資料欄位）',
    });
  }

  const enabled =
    typeof body.enabled === 'boolean' ? body.enabled : (row?.enabled ?? def.defaultEnabled);
  const positionRaw =
    typeof body.position === 'number' && Number.isFinite(body.position)
      ? Math.max(0, Math.min(500, Math.round(body.position)))
      : (row?.position ?? def.defaultPosition);

  await riskRepository.upsertDashboardBlock(auth.tenant.tenantId, {
    blockKey,
    enabled,
    position: positionRaw,
    settings: validated.data,
    updatedBy: auth.key.keyId,
  });
  await riskRepository.appendAuditLog({
    action: 'dashboard-block-update',
    tenantId: auth.tenant.tenantId,
    actorIp: requestIp(request),
    metadata: {
      blockKey,
      changedKeys: Array.isArray(body.changedKeys) ? body.changedKeys.slice(0, 30) : [],
      actorKeyId: auth.key.keyId,
    },
  });
  return {
    ok: true,
    block: { blockKey, enabled, position: positionRaw, settings: validated.data },
  };
});

/** 還原單一區塊為預設（刪除覆寫）。 */
app.post('/v1/dashboard/blocks/:blockKey/reset', async (request, reply) => {
  const auth = await resolveAuth(request);
  if (!auth) return reply.code(401).send({ error: 'unauthorized' });
  if (roleOfRequest(request, auth) !== 'security_admin') {
    return reply.code(403).send({ error: 'forbidden', message: '版面寫入限 security_admin' });
  }
  const { blockKey } = request.params as { blockKey: string };
  if (!BLOCK_REGISTRY[blockKey]) {
    return reply.code(404).send({ error: 'unknown_block', message: `未知區塊：${blockKey}` });
  }
  await riskRepository.resetDashboardBlock(auth.tenant.tenantId, blockKey);
  await riskRepository.appendAuditLog({
    action: 'dashboard-block-reset',
    tenantId: auth.tenant.tenantId,
    actorIp: requestIp(request),
    metadata: { blockKey, actorKeyId: auth.key.keyId },
  });
  return { ok: true, blockKey, reset: true };
});

/** 基準分布查詢（公開聚合，無個人資料）：rule × dim(country|asn|tz) 的 total/hits/hit_rate。 */
app.get('/v1/baselines', async (request, reply) => {
  const q = request.query as { rule?: string; dim?: string; dimValue?: string; limit?: string };
  const dim =
    q.dim && ['country', 'asn', 'tz'].includes(q.dim) ? (q.dim as 'country' | 'asn' | 'tz') : undefined;
  const limit = q.limit ? Math.max(1, Math.min(1000, Number(q.limit))) : 200;
  const rows = await riskRepository.listBaselines({
    ruleId: q.rule || undefined,
    dim,
    dimValue: q.dimValue || undefined,
    limit,
  });
  return { rows, count: rows.length };
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
