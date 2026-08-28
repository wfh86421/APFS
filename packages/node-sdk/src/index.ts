import type { NormalizedSignal } from '@shieldscan/core-schema';

export interface ServerRequestContext {
  headers: Record<string, string | undefined>;
  ip: string;
  tls?: {
    ja4?: string;
    ja3?: string;
    http2Settings?: Record<string, number>;
    tcpFingerprint?: string;
  };
}

/**
 * 後端驗證 SDK（L0/L1 信任錨點）。
 *
 * 客戶端上報的訊號可被偽造，但 Server-side 的 HTTP headers、
 * TLS JA4/JA3、HTTP/2 SETTINGS、TCP 特徵無法從瀏覽器偽造。
 */
export async function collectServerSignals(
  ctx: ServerRequestContext,
): Promise<NormalizedSignal[]> {
  const now = new Date().toISOString();

  const signals: NormalizedSignal[] = [
    {
      id: `srv-${now}-headers`,
      pluginId: 'server.httpHeaders',
      pluginVersion: '0.1.0',
      platform: 'server',
      category: 'browser',
      key: 'httpHeaders',
      value: {
        userAgent: ctx.headers['user-agent'],
        acceptLanguage: ctx.headers['accept-language'],
        secChUa: ctx.headers['sec-ch-ua'],
        secChUaPlatform: ctx.headers['sec-ch-ua-platform'],
      },
      confidence: 1,
      collectedAt: now,
    },
  ];

  if (ctx.tls?.ja4) {
    signals.push({
      id: `srv-${now}-ja4`,
      pluginId: 'server.tlsJa4',
      pluginVersion: '0.1.0',
      platform: 'server',
      category: 'network',
      key: 'tlsJa4',
      value: {
        ja4: ctx.tls.ja4,
        ja3: ctx.tls.ja3,
        http2Settings: ctx.tls.http2Settings,
        tcpFingerprint: ctx.tls.tcpFingerprint,
      },
      confidence: 1,
      collectedAt: now,
    });
  }

  return signals;
}

/** SDK 上報完整性驗證：nonce + timestamp + signature（預留實作）。 */
export function verifyReportIntegrity(input: {
  nonce: string;
  timestamp: string;
  signature: string;
  secret: string;
}): boolean {
  const ageMs = Date.now() - new Date(input.timestamp).getTime();
  if (Number.isNaN(ageMs) || Math.abs(ageMs) > 5 * 60 * 1000) return false;
  return input.nonce.length > 0 && input.signature.length > 0 && input.secret.length > 0;
}
