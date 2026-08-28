import type { GeoIpInfo, GeoIpProvider } from '../types.js';

interface IpApiResponse {
  status: 'success' | 'fail';
  message?: string;
  query: string;
  country?: string;
  countryCode?: string;
  regionName?: string;
  city?: string;
  lat?: number;
  lon?: number;
  zip?: string;
  isp?: string;
  as?: string;
  timezone?: string;
  proxy?: boolean;
  hosting?: boolean;
}

/**
 * ip-api.com 免費版（45 req/min，非商業用途）。
 * 回傳 proxy / hosting 欄位；vpn/tor 需自行補強（後續接 threat intel feed）。
 */
export class IpApiProvider implements GeoIpProvider {
  constructor(private readonly endpoint = 'http://ip-api.com/json') {}

  async lookup(ip: string): Promise<GeoIpInfo | null> {
    const url = `${this.endpoint}/${encodeURIComponent(ip)}?fields=status,message,query,country,countryCode,regionName,city,lat,lon,zip,isp,as,timezone,proxy,hosting`;
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return null;
    const data = (await response.json()) as IpApiResponse;
    if (data.status !== 'success') return null;

    return {
      ip: data.query,
      country: data.country,
      countryCode: data.countryCode,
      region: data.regionName,
      city: data.city,
      latitude: data.lat,
      longitude: data.lon,
      postalCode: data.zip,
      isp: data.isp,
      asn: data.as,
      timezone: data.timezone,
      proxy: data.proxy,
      vpn: false,
      tor: false,
      datacenter: data.hosting,
      source: 'ip-api',
    };
  }
}
