/**
 * ShieldScan 統一資料契約（Phase 0 定稿）
 *
 * 所有平台（Web / Android / iOS / WebView / Node / API）與所有插件
 * 都必須回到同一份 EnvironmentReport。
 *
 * 型別一律由 zod schema 推導，避免 TS 型別與執行期驗證漂移。
 */

import { z } from 'zod';

/** 資料契約版本。任何破壞性變更都必須升版，並記錄於 CHANGELOG。 */
export const SCHEMA_VERSION = '0.1.0' as const;

/* ------------------------------------------------------------------ */
/* 基礎列舉                                                             */
/* ------------------------------------------------------------------ */

export const zPlatform = z.enum([
  'browser',
  'android',
  'ios',
  'webview',
  'node',
  'edge',
  'server',
]);
export type Platform = z.infer<typeof zPlatform>;

export const zPluginType = z.enum([
  'detection',
  'analysis',
  'scoring',
  'policy',
  'output',
]);
export type PluginType = z.infer<typeof zPluginType>;

export const zReportSource = z.enum([
  'web',
  'android',
  'ios',
  'webview',
  'node',
  'api',
]);
export type ReportSource = z.infer<typeof zReportSource>;

export const zConsentMode = z.enum(['local-only', 'standard', 'stored']);
export type ConsentMode = z.infer<typeof zConsentMode>;

export const zSignalCategory = z.enum([
  'browser',
  'hardware',
  'network',
  'security',
  'behavior',
  'software',
  'mobile',
  'app',
  'content',
]);
export type SignalCategory = z.infer<typeof zSignalCategory>;

export const zSeverity = z.enum(['info', 'low', 'medium', 'high', 'critical']);
export type Severity = z.infer<typeof zSeverity>;

export const zPolicyDecision = z.enum([
  'allow',
  'review',
  'challenge',
  'limit',
  'block',
  'log_only',
]);
export type PolicyDecision = z.infer<typeof zPolicyDecision>;

/* ------------------------------------------------------------------ */
/* 治理與證據鏈列舉（嚴謹查證模式定版）                                   */
/* ------------------------------------------------------------------ */

export const zSensitivity = z.enum(['low', 'medium', 'high', 'critical']);
export type Sensitivity = z.infer<typeof zSensitivity>;

export const zEvidenceConfidence = z.enum(['low', 'medium', 'high']);
export type EvidenceConfidence = z.infer<typeof zEvidenceConfidence>;

export const zFieldStatus = z.enum(['active', 'experimental', 'deprecated', 'removed']);
export type FieldStatus = z.infer<typeof zFieldStatus>;

export const zRetentionClass = z.enum(['short', 'medium', 'long', 'policy']);
export type RetentionClass = z.infer<typeof zRetentionClass>;

export const zRiskEventType = z.enum([
  'open_ports',
  'os_mismatch',
  'canvas_tampering',
  'dns_leak',
  'webrtc_mismatch',
  'proxy_detected',
  'vpn_detected',
  'tor_detected',
  'blacklist_hit',
  'bot_suspected',
  'geo_velocity_anomaly',
  'fingerprint_instability',
  'timezone_mismatch',
  'language_mismatch',
]);
export type RiskEventType = z.infer<typeof zRiskEventType>;

export const zSignalEvidence = z
  .object({
    source: z.string().min(1),
    method: z.string().optional(),
    confidence: zEvidenceConfidence,
    sensitivity: zSensitivity,
    collectedAt: z.string().datetime({ offset: true }).optional(),
    schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/, '版本必須為 semver，例如 1.4.0'),
    rawReference: z.string().optional(),
    policy: z
      .object({
        accessRoles: z.array(z.string()).min(1),
        retentionClass: zRetentionClass,
      })
      .strict()
      .optional(),
  })
  .strict();
export type SignalEvidence = z.infer<typeof zSignalEvidence>;

/* ------------------------------------------------------------------ */
/* PluginManifest                                                       */
/* ------------------------------------------------------------------ */

export const zPluginManifest = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, '版本必須為 semver，例如 1.2.0'),
    type: zPluginType,
    platforms: z.array(zPlatform).min(1),
    capabilities: z.array(z.string()),
    requiredPermissions: z.array(z.string()),
    inputSchema: z.string().min(1),
    outputSchema: z.string().min(1),
    riskLevel: z.enum(['low', 'medium', 'high']),
    defaultEnabled: z.boolean(),
    resources: z
      .object({
        maxMemoryMB: z.number().positive(),
        maxExecutionTimeMs: z.number().positive(),
        cpuQuota: z.number().nonnegative(),
      })
      .optional(),
  })
  .strict();
export type PluginManifest = z.infer<typeof zPluginManifest>;

/* ------------------------------------------------------------------ */
/* 訊號 / 問題 / 評分 / 完整性                                            */
/* ------------------------------------------------------------------ */

export const zNormalizedSignal = z
  .object({
    id: z.string().min(1),
    pluginId: z.string().min(1),
    pluginVersion: z.string().min(1),
    platform: zPlatform,
    category: zSignalCategory,
    key: z.string().min(1),
    value: z.unknown(),
    hash: z.string().optional(),
    confidence: z.number().min(0).max(1),
    collectedAt: z.string().datetime({ offset: true }),
    sensitivity: zSensitivity.optional(),
    evidence: zSignalEvidence.optional(),
  })
  .strict();
export type NormalizedSignal = z.infer<typeof zNormalizedSignal>;

export const zAnalysisIssue = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    severity: zSeverity,
    description: z.string().min(1),
    evidence: z.record(z.string(), z.unknown()),
  })
  .strict();
export type AnalysisIssue = z.infer<typeof zAnalysisIssue>;

/* ------------------------------------------------------------------ */
/* RiskEvent（risk_events 查詢層契約）                                   */
/* ------------------------------------------------------------------ */

export const zRiskEvent = z
  .object({
    eventId: z.string().min(1),
    tenantId: z.string().optional(),
    sessionId: z.string().min(1),
    reportId: z.string().optional(),
    eventType: zRiskEventType,
    severity: zSeverity,
    confidence: zEvidenceConfidence,
    evidenceJson: z.record(z.string(), z.unknown()),
    ruleId: z.string().min(1),
    ruleVersion: z.string().regex(/^\d+\.\d+\.\d+$/, '版本必須為 semver，例如 1.2.0'),
    scoreImpact: z.number().optional(),
    autoAction: zPolicyDecision.optional(),
    reviewRequired: z.boolean(),
    detectedAt: z.string().datetime({ offset: true }),
    reviewStatus: z
      .enum(['pending', 'in_review', 'reviewed', 'closed'])
      .optional(),
    reviewerId: z.string().optional(),
    falsePositiveFlag: z.boolean().optional(),
  })
  .strict();
export type RiskEvent = z.infer<typeof zRiskEvent>;

/* ------------------------------------------------------------------ */
/* FieldDefinition（Schema Registry / field_definitions）               */
/* ------------------------------------------------------------------ */

export const zFieldDefinition = z
  .object({
    fieldPath: z.string().min(1),
    displayName: z.string().min(1),
    category: zSignalCategory,
    sensitivity: zSensitivity,
    defaultConfidence: zEvidenceConfidence,
    stability: z.enum(['stable', 'volatile', 'unknown']),
    purpose: z.string().min(1),
    retentionClass: zRetentionClass,
    accessRoles: z.array(z.string()).min(1),
    uiModule: z.string().min(1),
    status: zFieldStatus,
    version: z.string().regex(/^\d+\.\d+\.\d+$/, '版本必須為 semver，例如 1.0.0'),
  })
  .strict();
export type FieldDefinition = z.infer<typeof zFieldDefinition>;

export const zScoreBundle = z
  .object({
    privacyExposure: z.number().min(0).max(100),
    authenticity: z.number().min(0).max(100),
    automationRisk: z.number().min(0).max(100),
    networkTrust: z.number().min(0).max(100),
    mobileIntegrity: z.number().min(0).max(100).optional(),
    contentAbuseRisk: z.number().min(0).max(100).optional(),
    custom: z.record(z.string(), z.number()).optional(),
  })
  .strict();
export type ScoreBundle = z.infer<typeof zScoreBundle>;

export const zReportIntegrity = z
  .object({
    // 匿名掃描（瀏覽器 SDK 無密鑰）允許空簽章；伺服器會依租戶判定是否必填。
    signature: z.string(),
    nonce: z.string().min(1),
    timestamp: z.string().datetime({ offset: true }),
    sdkVersion: z.string().min(1),
  })
  .strict();
export type ReportIntegrity = z.infer<typeof zReportIntegrity>;

/* ------------------------------------------------------------------ */
/* EnvironmentReport                                                    */
/* ------------------------------------------------------------------ */

export const zEnvironmentReport = z
  .object({
    reportId: z.string().min(1),
    schemaVersion: z.string().min(1),
    tenantId: z.string().optional(),
    sessionId: z.string().min(1),
    subjectId: z.string().optional(),
    source: zReportSource,
    createdAt: z.string().datetime({ offset: true }),
    consent: z
      .object({
        mode: zConsentMode,
        retentionDays: z.number().int().positive().optional(),
      })
      .strict(),
    sdk: z
      .object({
        name: z.string().min(1),
        version: z.string().min(1),
        platform: zPlatform,
      })
      .strict(),
    signals: z.array(zNormalizedSignal),
    issues: z.array(zAnalysisIssue),
    scores: zScoreBundle,
    policy: zPolicyDecision.optional(),
    outputs: z.array(z.unknown()).optional(),
    integrity: zReportIntegrity,
    raw: z.unknown().optional(),
  })
  .strict();
export type EnvironmentReport = z.infer<typeof zEnvironmentReport>;

/* ------------------------------------------------------------------ */
/* Validator helpers                                                    */
/* ------------------------------------------------------------------ */

export interface ValidationResult<T> {
  ok: true;
  data: T;
}

export interface ValidationFailure {
  ok: false;
  errors: Array<{
    path: string;
    message: string;
  }>;
}

export type Validation<T> = ValidationResult<T> | ValidationFailure;

function toFailure(error: z.ZodError): ValidationFailure {
  return {
    ok: false,
    errors: error.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    })),
  };
}

export function validateEnvironmentReport(input: unknown): Validation<EnvironmentReport> {
  const result = zEnvironmentReport.safeParse(input);
  return result.success ? { ok: true, data: result.data } : toFailure(result.error);
}

export function validatePluginManifest(input: unknown): Validation<PluginManifest> {
  const result = zPluginManifest.safeParse(input);
  return result.success ? { ok: true, data: result.data } : toFailure(result.error);
}

export function validateNormalizedSignal(input: unknown): Validation<NormalizedSignal> {
  const result = zNormalizedSignal.safeParse(input);
  return result.success ? { ok: true, data: result.data } : toFailure(result.error);
}

export function validateScoreBundle(input: unknown): Validation<ScoreBundle> {
  const result = zScoreBundle.safeParse(input);
  return result.success ? { ok: true, data: result.data } : toFailure(result.error);
}

export function validateSignalEvidence(input: unknown): Validation<SignalEvidence> {
  const result = zSignalEvidence.safeParse(input);
  return result.success ? { ok: true, data: result.data } : toFailure(result.error);
}

export function validateRiskEvent(input: unknown): Validation<RiskEvent> {
  const result = zRiskEvent.safeParse(input);
  return result.success ? { ok: true, data: result.data } : toFailure(result.error);
}

export function validateFieldDefinition(input: unknown): Validation<FieldDefinition> {
  const result = zFieldDefinition.safeParse(input);
  return result.success ? { ok: true, data: result.data } : toFailure(result.error);
}
