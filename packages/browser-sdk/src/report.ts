import {
  SCHEMA_VERSION,
  type ConsentMode,
  type EnvironmentReport,
  type NormalizedSignal,
  type ReportSource,
} from '@shieldscan/core-schema';
import { signReport } from '@shieldscan/signing';
import { newUuid } from './uuid.js';

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
  /** 正式簽章用的共享 secret（由平台簽發，session 級）。未提供則 signature 留空。 */
  signingSecret?: string;
}

/**
 * 把採集結果組裝成完整 EnvironmentReport。
 *
 * 前端只做組裝，不負責評分決策；scores 由後端分析引擎填寫
 * （Phase 1 網站可在本地用 scoring-engine 預覽分數）。
 */
export async function buildReport(
  signals: NormalizedSignal[],
  options: BuildReportOptions,
): Promise<EnvironmentReport> {
  const now = new Date().toISOString();
  const sdkVersion = options.sdkVersion ?? '0.1.0';
  const nonce = newUuid();

  const report: EnvironmentReport = {
    reportId: newUuid(),
    schemaVersion: SCHEMA_VERSION,
    sessionId: options.sessionId ?? newUuid(),
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
      signature: '',
      nonce,
      timestamp: now,
      sdkVersion,
    },
  };

  if (options.signingSecret) {
    // Phase 3 正式簽章：HMAC-SHA256 over reportId/sessionId/schemaVersion/
    // createdAt/nonce/timestamp/signals-hash，伺服器可用共享 secret 驗證。
    report.integrity.signature = await signReport(report, options.signingSecret);
  }

  return report;
}
