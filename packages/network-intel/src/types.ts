export interface GeoIpInfo {
  ip: string;
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  postalCode?: string;
  isp?: string;
  asn?: string;
  timezone?: string;
  proxy?: boolean;
  vpn?: boolean;
  tor?: boolean;
  datacenter?: boolean;
  source: 'ip-api' | 'mock' | 'maxmind';
}

export interface GeoIpProvider {
  lookup(ip: string): Promise<GeoIpInfo | null>;
}

export type WebrtcConsistency = 'consistent' | 'leak' | 'unknown';

export interface NetworkAnalysis {
  ip: string;
  geo: GeoIpInfo | null;
  proxy: boolean;
  vpn: boolean;
  tor: boolean;
  datacenter: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  webrtc: {
    consistency: WebrtcConsistency;
    localIps: string[];
    publicIp: string;
  };
  dnsLeak?: {
    detected: boolean;
    dnsServers: string[];
    expectedIsp?: string;
  };
}
