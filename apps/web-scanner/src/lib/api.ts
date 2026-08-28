import type { EnvironmentReport, PolicyDecision } from '@shieldscan/core-schema';
import type { ScoreResult } from '@shieldscan/scoring-engine';

/** 伺服器回傳的網路分析（與 @shieldscan/network-intel 的 NetworkAnalysis 結構一致）。 */
export interface ServerNetworkAnalysis {
  ip: string;
  geo: {
    ip: string;
    isp?: string;
    asn?: string;
    country?: string;
    region?: string;
    city?: string;
    timezone?: string;
  } | null;
  proxy: boolean;
  vpn: boolean;
  tor: boolean;
  datacenter: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  webrtc: {
    consistency: 'consistent' | 'leak' | 'unknown';
    localIps: string[];
    publicIp: string;
  };
  dnsLeak?: {
    detected: boolean;
    dnsServers: string[];
    expectedIsp?: string;
  };
}

export interface ReportSubmissionResult {
  reportId: string;
  schemaVersion: string;
  score: ScoreResult;
  policy: PolicyDecision;
  network: ServerNetworkAnalysis;
}

/** API Base URL：可用 NEXT_PUBLIC_API_URL 覆寫（預設本機開發 API）。 */
export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
}

/**
 * 上傳 EnvironmentReport 到 POST /v1/reports。
 * standard / stored 模式呼叫；local-only 模式不呼叫。
 */
export async function submitReport(
  report: EnvironmentReport,
  timeoutMs = 8000,
): Promise<ReportSubmissionResult> {
  const response = await fetch(`${apiBaseUrl()}/v1/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`伺服器回應 ${response.status}`);
  }
  return (await response.json()) as ReportSubmissionResult;
}
