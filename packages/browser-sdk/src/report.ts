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
export async function buildReport(
  signals: NormalizedSignal[],
  options: BuildReportOptions,
): Promise<EnvironmentReport> {
  const now = new Date().toISOString();
  const sdkVersion = options.sdkVersion ?? '0.1.0';
  const nonce = crypto.randomUUID();

  // 信封自雜湊指紋：對 nonce/timestamp/sdkVersion 做 SHA-256，防傳輸途中被改動。
  // 注意：這不是伺服器可驗證的簽章；Phase 3 會換成正式簽章 + server challenge。
  const envelope = `${nonce}|${now}|${sdkVersion}`;
  const signature = await sha256(envelope);

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
      signature,
      nonce,
      timestamp: now,
      sdkVersion,
    },
  };
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
