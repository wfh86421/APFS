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

    return {
      key: 'webrtc',
      value: { localIps: [...ips] },
      hash: await sha256([...ips].sort().join('|')),
      confidence: 0.85,
    };
  },
  getEntropy: () => 6,
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
