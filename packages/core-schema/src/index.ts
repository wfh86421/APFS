/**
 * ShieldScan 統一資料契約
 *
 * 所有平台（Web / Android / iOS / WebView / Node / API）與所有插件
 * 都必須回到同一份 EnvironmentReport。
 */

export type Platform =
  | 'browser'
  | 'android'
  | 'ios'
  | 'webview'
  | 'node'
  | 'edge'
  | 'server';

export type PluginType =
  | 'detection'
  | 'analysis'
  | 'scoring'
  | 'policy'
  | 'output';

export type ReportSource =
  | 'web'
  | 'android'
  | 'ios'
  | 'webview'
  | 'node'
  | 'api';

export type ConsentMode = 'local-only' | 'standard' | 'stored';

export type SignalCategory =
  | 'browser'
  | 'hardware'
  | 'network'
  | 'security'
  | 'mobile'
  | 'app'
  | 'content';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  type: PluginType;
  platforms: Platform[];
  capabilities: string[];
  requiredPermissions: string[];
  inputSchema: string;
  outputSchema: string;
  riskLevel: 'low' | 'medium' | 'high';
  defaultEnabled: boolean;
  resources?: {
    maxMemoryMB: number;
    maxExecutionTimeMs: number;
    cpuQuota: number;
  };
}

export interface NormalizedSignal {
  id: string;
  pluginId: string;
  pluginVersion: string;
  platform: Platform;
  category: SignalCategory;
  key: string;
  value: unknown;
  hash?: string;
  confidence: number;
  collectedAt: string;
}

export interface AnalysisIssue {
  id: string;
  type: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: Record<string, unknown>;
}

export interface ScoreBundle {
  privacyExposure: number;
  authenticity: number;
  automationRisk: number;
  networkTrust: number;
  mobileIntegrity?: number;
  contentAbuseRisk?: number;
  custom?: Record<string, number>;
}

export type PolicyDecision =
  | 'allow'
  | 'review'
  | 'challenge'
  | 'limit'
  | 'block'
  | 'log_only';

export interface ReportIntegrity {
  signature: string;
  nonce: string;
  timestamp: string;
  sdkVersion: string;
}

export interface EnvironmentReport {
  reportId: string;
  tenantId?: string;
  sessionId: string;
  subjectId?: string;
  source: ReportSource;
  createdAt: string;
  consent: {
    mode: ConsentMode;
    retentionDays?: number;
  };
  sdk: {
    name: string;
    version: string;
    platform: Platform;
  };
  signals: NormalizedSignal[];
  issues: AnalysisIssue[];
  scores: ScoreBundle;
  policy?: PolicyDecision;
  outputs?: unknown[];
  integrity: ReportIntegrity;
  raw?: unknown;
}
