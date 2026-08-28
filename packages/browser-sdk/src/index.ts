import type { NormalizedSignal, Platform } from '@shieldscan/core-schema';

export interface DetectionModule {
  id: string;
  name: string;
  category: 'hardware' | 'network' | 'browser' | 'behavior' | 'software';
  version: string;
  priority: number;
  collect(): Promise<SignalPayload>;
  validate?(payload: SignalPayload): boolean;
  getEntropy?(): number;
}

export interface SignalPayload {
  key: string;
  value: unknown;
  hash?: string;
  confidence: number;
}

export interface ScanOptions {
  modules?: string[];
  timeoutMs?: number;
  consentMode?: 'local-only' | 'standard' | 'stored';
}

export interface ScanSession {
  sessionId: string;
  onProgress(cb: (event: { module: string; progress: number }) => void): void;
  waitForCompletion(): Promise<NormalizedSignal[]>;
}

/**
 * ShieldScan 瀏覽器端 SDK。
 *
 * 採集核心以插件模組掛載，framework-agnostic：
 * 同一套 SDK 可被 React / Vue / 原生 JS / WebView 使用。
 */
export class ShieldScanSDK {
  private modules = new Map<string, DetectionModule>();
  private readonly platform: Platform = 'browser';

  constructor(private readonly config: { sdkVersion: string }) {}

  register(module: DetectionModule): void {
    this.modules.set(module.id, module);
  }

  unregister(moduleId: string): void {
    this.modules.delete(moduleId);
  }

  listModules(): DetectionModule[] {
    return [...this.modules.values()].sort((a, b) => a.priority - b.priority);
  }

  async scan(options: ScanOptions = {}): Promise<ScanSession> {
    const selected = this.listModules().filter(
      (m) => !options.modules || options.modules.includes(m.id),
    );

    return {
      sessionId: crypto.randomUUID(),
      onProgress() {
        /* 預留：scanStream 實作後接上進度事件 */
      },
      async waitForCompletion() {
        const signals: NormalizedSignal[] = [];
        for (const module of selected) {
          const payload = await module.collect();
          signals.push({
            id: crypto.randomUUID(),
            pluginId: module.id,
            pluginVersion: module.version,
            platform: 'browser',
            category: module.category,
            key: payload.key,
            value: payload.value,
            hash: payload.hash,
            confidence: payload.confidence,
            collectedAt: new Date().toISOString(),
          });
        }
        return signals;
      },
    };
  }
}

export { canvasModule } from './modules/canvas.js';
export { webglModule } from './modules/webgl.js';
export { webgpuModule } from './modules/webgpu.js';
export { audioModule } from './modules/audio.js';
export { screenModule } from './modules/screen.js';
export { localeModule } from './modules/locale.js';
export { timezoneModule } from './modules/timezone.js';
export { webrtcModule } from './modules/webrtc.js';
