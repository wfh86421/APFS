import type { DetectionModule } from '../index.js';

/**
 * 媒體裝置狀態（隱私安全版：**不取流、不觸發權限詢問**）。
 *
 * enumerateDevices() 在未授權時 deviceId/label 皆為空，仍可回報各 kind 的裝置數；
 * `labeled > 0` 代表該來源曾授權過媒體權限（跨 session 狀態特徵）。
 */
export const mediaDevicesModule: DetectionModule = {
  id: 'browser.mediaDevices',
  name: '媒體裝置狀態',
  category: 'hardware',
  version: '0.1.0',
  priority: 47,
  async collect() {
    const md = navigator.mediaDevices as
      | (MediaDevices & { enumerateDevices?: () => Promise<MediaDeviceInfo[]> })
      | undefined;
    if (!md || typeof md.enumerateDevices !== 'function') {
      return { key: 'mediaDevices', value: { supported: false }, confidence: 1 };
    }
    try {
      const devices = await md.enumerateDevices();
      const counts: Record<string, number> = {};
      let labeled = 0;
      for (const d of devices) {
        counts[d.kind] = (counts[d.kind] ?? 0) + 1;
        if (d.label && d.label.length > 0) labeled += 1;
      }
      const value = { supported: true, counts, deviceCount: devices.length, labeled };
      return {
        key: 'mediaDevices',
        value,
        hash: await sha256(
          `${counts.audioinput ?? 0}|${counts.videoinput ?? 0}|${counts.audiooutput ?? 0}|${labeled}`,
        ),
        confidence: 0.85,
      };
    } catch {
      return { key: 'mediaDevices', value: { supported: true, error: true }, confidence: 0.8 };
    }
  },
  getEntropy: () => 4,
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
