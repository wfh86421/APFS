import type { GeoIpInfo, GeoIpProvider, NetworkAnalysis, WebrtcConsistency } from './types.js';

function isPublicIp(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    if (value < 0 || value > 255) return false;
  }
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return false;
  }
  if (a === 10 || a === 127) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  return true;
}

export function webrtcConsistency(
  localIps: string[],
  publicIp: string,
): WebrtcConsistency {
  const publicLocal = localIps.filter((ip) => isPublicIp(ip));
  if (publicLocal.length === 0) return 'unknown';
  return publicLocal.every((ip) => ip === publicIp) ? 'consistent' : 'leak';
}

export function detectDnsLeak(
  dnsServers: string[],
  expectedIsp?: string,
  geoIsp?: string,
): { detected: boolean; detail: string } {
  if (dnsServers.length === 0) {
    return { detected: false, detail: '無 DNS 樣本' };
  }
  if (expectedIsp && geoIsp && !expectedIsp.includes(geoIsp) && !geoIsp.includes(expectedIsp)) {
    return {
      detected: true,
      detail: `DNS 伺服器 ISP（${geoIsp}）與預期 ISP（${expectedIsp}）不一致`,
    };
  }
  return { detected: false, detail: 'DNS 與預期 ISP 一致' };
}

export interface AnalyzeOptions {
  localIps?: string[];
  dnsServers?: string[];
  expectedIsp?: string;
}

/** 把 GeoIP 資訊轉成網路風險分析（L0/L1 信任錨點）。 */
export function analyzeNetwork(
  ip: string,
  geo: GeoIpInfo | null,
  options: AnalyzeOptions = {},
): NetworkAnalysis {
  const proxy = geo?.proxy ?? false;
  const vpn = geo?.vpn ?? false;
  const tor = geo?.tor ?? false;
  const datacenter = geo?.datacenter ?? false;

  const riskScore =
    (proxy ? 1 : 0) + (vpn ? 1 : 0) + (tor ? 2 : 0) + (datacenter ? 1 : 0);
  const riskLevel =
    tor ? 'critical' : riskScore >= 2 ? 'high' : riskScore === 1 ? 'medium' : 'low';

  const localIps = options.localIps ?? [];
  const dnsLeak = detectDnsLeak(options.dnsServers ?? [], options.expectedIsp, geo?.isp);

  return {
    ip,
    geo,
    proxy,
    vpn,
    tor,
    datacenter,
    riskLevel,
    webrtc: {
      consistency: webrtcConsistency(localIps, ip),
      localIps,
      publicIp: ip,
    },
    dnsLeak: {
      detected: dnsLeak.detected,
      dnsServers: options.dnsServers ?? [],
      expectedIsp: options.expectedIsp,
    },
  };
}

export async function analyzeIp(
  ip: string,
  provider: GeoIpProvider,
  options: AnalyzeOptions = {},
): Promise<NetworkAnalysis> {
  const geo = await provider.lookup(ip);
  return analyzeNetwork(ip, geo, options);
}
