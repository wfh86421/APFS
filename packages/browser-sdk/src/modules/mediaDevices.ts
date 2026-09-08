import { sha256 } from '../sha.js';
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
    // enumerateDevices 只在安全連線（https/localhost）暴露；plain-http 部署時誠實標記原因。
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      return {
        key: 'mediaDevices',
        value: { supported: false, reason: 'insecure-context' },
        confidence: 1,
      };
    }
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

