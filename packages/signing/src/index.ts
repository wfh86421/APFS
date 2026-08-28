import type { EnvironmentReport } from '@shieldscan/core-schema';

export interface VerifyResult {
  valid: boolean;
  reason?: 'missing_signature' | 'invalid_timestamp' | 'expired' | 'signature_mismatch' | 'ok';
}

const encoder = new TextEncoder();

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256Hex(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(text));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 簽章用的正規化字串。
 *
 * 不包含 signature 本身（避免自我參照）；包含 nonce、timestamp 與
 * signals 內容雜湊，任何欄位被竄改都會導致驗證失敗。
 */
export function canonicalReportPayload(
  report: EnvironmentReport,
  signalsHash: string,
): string {
  return [
    report.reportId,
    report.sessionId,
    report.schemaVersion,
    report.createdAt,
    report.integrity.nonce,
    report.integrity.timestamp,
    signalsHash,
  ].join('|');
}

/** 對整份報告簽章，回傳 hex HMAC-SHA256。 */
export async function signReport(
  report: EnvironmentReport,
  secret: string,
): Promise<string> {
  const signalsHash = await sha256Hex(JSON.stringify(report.signals));
  return hmacSha256Hex(secret, canonicalReportPayload(report, signalsHash));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export interface VerifySignedReportOptions {
  maxAgeMs?: number;
}

/** 驗證報告完整性：簽名、nonce、timestamp 時效。 */
export async function verifySignedReport(
  report: EnvironmentReport,
  secret: string,
  options: VerifySignedReportOptions = {},
): Promise<VerifyResult> {
  const maxAgeMs = options.maxAgeMs ?? 5 * 60 * 1000;

  if (!report.integrity.signature) {
    return { valid: false, reason: 'missing_signature' };
  }

  const timestamp = Date.parse(report.integrity.timestamp);
  if (Number.isNaN(timestamp)) {
    return { valid: false, reason: 'invalid_timestamp' };
  }
  if (Math.abs(Date.now() - timestamp) > maxAgeMs) {
    return { valid: false, reason: 'expired' };
  }

  const expected = await signReport(report, secret);
  return constantTimeEqual(expected, report.integrity.signature)
    ? { valid: true, reason: 'ok' }
    : { valid: false, reason: 'signature_mismatch' };
}
