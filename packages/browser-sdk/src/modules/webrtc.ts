import { sha256 } from '../sha.js';
import type { DetectionModule } from '../index.js';

/**
 * WebRTC 洩漏檢測：透過 STUN 取得本地/真實 IP。
 * 正式版應多節點輪詢並與 Server 端比對。
 */
export const webrtcModule: DetectionModule = {
  id: 'browser.webrtc',
  name: 'WebRTC 洩漏',
  category: 'network',
  version: '0.1.0',
  priority: 80,
  async collect() {
    const ips = new Set<string>();

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
      ],
    });

    pc.createDataChannel('shieldscan');
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const match = /([0-9]{1,3}(\.[0-9]{1,3}){3})/.exec(e.candidate.candidate);
      const ip = match?.[1];
      if (ip) ips.add(ip);
    };

    await pc.createOffer().then((offer) => pc.setLocalDescription(offer));
    await new Promise((r) => setTimeout(r, 500));
    pc.close();

    const allIps = [...ips];
    // srflx（STUN 伺服器反射）candidate 的位址＝NAT 後的「映射公網 IP」；
    // 過濾掉私網/環回/鏈路本地位址後剩餘者即為對外真實位址（VPN 下與連線 IP 會不同）。
    const mappedPublicIp = allIps.find((ip) => isGlobalIpv4(ip));

    return {
      key: 'webrtc',
      value: { localIps: allIps, mappedPublicIp },
      hash: await sha256(allIps.sort().join('|')),
      confidence: 0.85,
    };
  },
  getEntropy: () => 6,
};

/** 僅保留全域單播 IPv4（排除私網/環回/鏈路本地位址）。 */
function isGlobalIpv4(ip: string): boolean {
  const parts = ip.split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const a = parts[0] as number;
  const b = parts[1] as number;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a >= 224) return false;
  return true;
}

