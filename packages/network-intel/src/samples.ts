import type { GeoIpInfo } from './types.js';

/**
 * 已知分類測試樣本（模擬「已知 VPN/Proxy/固定 IP 測試樣本」驗收指標）。
 * 每筆定義預期分類，準確率測試要求 ≥95%。
 */
export interface NetworkSample {
  ip: string;
  geo: GeoIpInfo;
  expected: {
    proxy: boolean;
    vpn: boolean;
    tor: boolean;
    datacenter: boolean;
  };
  note: string;
}

export const NETWORK_SAMPLES: NetworkSample[] = [
  {
    ip: '49.214.1.196',
    geo: {
      ip: '49.214.1.196',
      isp: 'Taiwan Fixed Network',
      asn: 'AS3462',
      timezone: 'Asia/Taipei',
      proxy: false,
      vpn: false,
      tor: false,
      datacenter: false,
      source: 'mock',
    },
    expected: { proxy: false, vpn: false, tor: false, datacenter: false },
    note: '台灣固網固定 IP（使用者報告）',
  },
  {
    ip: '203.0.113.10',
    geo: {
      ip: '203.0.113.10',
      isp: 'Chunghwa Telecom',
      asn: 'AS3462',
      timezone: 'Asia/Taipei',
      proxy: false,
      vpn: false,
      tor: false,
      datacenter: false,
      source: 'mock',
    },
    expected: { proxy: false, vpn: false, tor: false, datacenter: false },
    note: '中華電信家用線路',
  },
  {
    ip: '45.155.204.5',
    geo: {
      ip: '45.155.204.5',
      isp: 'M247',
      asn: 'AS9009',
      timezone: 'Europe/Amsterdam',
      proxy: true,
      vpn: true,
      tor: false,
      datacenter: true,
      source: 'mock',
    },
    expected: { proxy: true, vpn: true, tor: false, datacenter: true },
    note: 'M247 VPN/Proxy 提供商',
  },
  {
    ip: '185.220.101.34',
    geo: {
      ip: '185.220.101.34',
      isp: 'Digitalcourage',
      asn: 'AS210444',
      timezone: 'Europe/Berlin',
      proxy: true,
      vpn: false,
      tor: true,
      datacenter: true,
      source: 'mock',
    },
    expected: { proxy: true, vpn: false, tor: true, datacenter: true },
    note: 'Tor 出口節點',
  },
  {
    ip: '34.120.35.1',
    geo: {
      ip: '34.120.35.1',
      isp: 'Google LLC',
      asn: 'AS396982',
      timezone: 'America/Chicago',
      proxy: false,
      vpn: false,
      tor: false,
      datacenter: true,
      source: 'mock',
    },
    expected: { proxy: false, vpn: false, tor: false, datacenter: true },
    note: 'GCP 雲端主機',
  },
  {
    ip: '20.205.243.166',
    geo: {
      ip: '20.205.243.166',
      isp: 'Microsoft',
      asn: 'AS8075',
      timezone: 'Asia/Singapore',
      proxy: false,
      vpn: false,
      tor: false,
      datacenter: true,
      source: 'mock',
    },
    expected: { proxy: false, vpn: false, tor: false, datacenter: true },
    note: 'Azure 雲端主機',
  },
];

export function isPublicIpv4(ip: string): boolean {
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
