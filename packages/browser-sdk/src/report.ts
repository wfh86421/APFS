import {
  SCHEMA_VERSION,
  type ConsentMode,
  type EnvironmentReport,
  type NormalizedSignal,
  type ReportSource,
} from '@shieldscan/core-schema';

export interface BuildReportOptions {
  sessionId?: string;
  subjectId?: string;
  source?: ReportSource;
  consent: {
    mode: ConsentMode;
    retentionDays?: number;
  };
  sdkName?: string;
  sdkVersion?: string;
}

/**
 * 把採集結果組裝成完整 EnvironmentReport。
 *
 * 前端只做組裝，不負責評分決策；scores 由後端分析引擎填寫
 * （Phase 1 網站可在本地用 scoring-engine 預覽分數）。
 */
export function buildReport(
  signals: NormalizedSignal[],
  options: BuildReportOptions,
): EnvironmentReport {
  const now = new Date().toISOString();
  const sdkVersion = options.sdkVersion ?? '0.1.0';

  return {
    reportId: crypto.randomUUID(),
    schemaVersion: SCHEMA_VERSION,
    sessionId: options.sessionId ?? crypto.randomUUID(),
    subjectId: options.subjectId,
    source: options.source ?? 'web',
    createdAt: now,
    consent: {
      mode: options.consent.mode,
      retentionDays: options.consent.retentionDays,
    },
    sdk: {
      name: options.sdkName ?? '@shieldscan/browser-sdk',
      version: sdkVersion,
      platform: 'browser',
    },
    signals,
    issues: [],
    scores: {
      privacyExposure: 0,
      authenticity: 0,
      automationRisk: 0,
      networkTrust: 0,
    },
    integrity: {
      // Phase 1：nonce/timestamp 由 SDK 產生；signature 由後端驗證服務填入。
      signature: '',
      nonce: crypto.randomUUID(),
      timestamp: now,
      sdkVersion,
    },
  };
}
