import Fastify from 'fastify';
import {
  SCHEMA_VERSION,
  type EnvironmentReport,
  type PolicyDecision,
  validateEnvironmentReport,
  type ValidationFailure,
} from '@shieldscan/core-schema';
import {
  defaultRules,
  ScoringEngine,
  type ScoreResult,
  type ScoringProfile,
} from '@shieldscan/scoring-engine';

const app = Fastify({ logger: true });

const port = Number(process.env.PORT ?? 3001);

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

function validationReply(reply: { code: (code: number) => { send: (body: unknown) => unknown } }, failure: ValidationFailure) {
  return reply.code(400).send({ error: 'invalid_report', issues: failure.errors });
}

app.get('/health', async () => ({ status: 'ok', service: 'shieldscan-api' }));

/**
 * POST /v1/reports
 *
 * Phase 0 雛形：契約驗證 → 評分 → 回傳結果。
 * 持久化、分析插件、完整性簽章驗證將在 Phase 2/3 接入。
 */
app.post('/v1/reports', async (request, reply) => {
  const validation = validateEnvironmentReport(request.body);
  if (!validation.ok) return validationReply(reply, validation);

  const report: EnvironmentReport = validation.data;
  const score = await buildScoringEngine().calculate(report, report.issues, DEFAULT_PROFILE);

  return reply.code(201).send({
    reportId: report.reportId,
    schemaVersion: report.schemaVersion ?? SCHEMA_VERSION,
    score,
    policy: scoreToPolicy(score),
  });
});

app.get('/v1/reports/:id', async (_request, reply) => {
  // TODO: 需要報告儲存層（PostgreSQL）後實作。
  reply.code(501).send({ error: 'not_implemented', message: '報告儲存層尚未接入' });
});

/**
 * POST /v1/analyze
 *
 * 對已接收的訊號執行分析與評分；profileId 可選（預設 privacy-default）。
 */
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

/** POST /v1/scoring/calculate：對任意報告執行評分（供插件/企業測試）。 */
app.post('/v1/scoring/calculate', async (request, reply) => {
  const body = request.body as { report?: unknown; profile?: ScoringProfile };
  const validation = validateEnvironmentReport(body?.report);
  if (!validation.ok) return validationReply(reply, validation);

  const report: EnvironmentReport = validation.data;
  const profile: ScoringProfile = body.profile ?? DEFAULT_PROFILE;
  const score = await buildScoringEngine().calculate(report, report.issues, profile);
  return { score };
});

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
