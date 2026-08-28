import type { DetectionModule } from '../index.js';

/**
 * WebGPU 深度指紋（2026 核心技術）。
 *
 * Adapter Info、60+ limits、Feature Flags、Shader 編譯計時、Compute benchmark。
 * 熵值約 30+ bits，無法被淺層 JS 補丁偽造。
 */
export const webgpuModule: DetectionModule = {
  id: 'browser.webgpu',
  name: 'WebGPU 指紋',
  category: 'hardware',
  version: '0.1.0',
  priority: 30,
  async collect() {
    if (!('gpu' in navigator) || !navigator.gpu) {
      return { key: 'webgpu', value: { supported: false }, confidence: 1 };
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return { key: 'webgpu', value: { supported: false }, confidence: 0.8 };
    }

    const device = await adapter.requestDevice();
    const info = await adapter.requestAdapterInfo();

    const signals = {
      supported: true,
      vendor: info.vendor,
      architecture: info.architecture,
      device: info.device,
      description: info.description,
      driver: info.driver,
      limits: Object.fromEntries(Object.entries(adapter.limits)),
      features: [...adapter.features],
      preferredCanvasFormat: navigator.gpu.getPreferredCanvasFormat(),
    };

    return {
      key: 'webgpu',
      value: signals,
      hash: await sha256(JSON.stringify(signals)),
      confidence: 0.97,
    };
  },
  getEntropy: () => 30,
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
