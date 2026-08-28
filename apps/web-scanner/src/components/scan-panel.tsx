'use client';

import { useState } from 'react';
import {
  audioModule,
  canvasModule,
  clientHintsModule,
  localeModule,
  screenModule,
  ShieldScanSDK,
  timezoneModule,
  uaModule,
  webglModule,
  webgpuModule,
  webrtcModule,
  type ScanProgressEvent,
} from '@shieldscan/browser-sdk';
import type { NormalizedSignal } from '@shieldscan/core-schema';
import type { ConsentState } from './consent-banner';

const MODULES = [
  uaModule,
  clientHintsModule,
  canvasModule,
  webglModule,
  webgpuModule,
  audioModule,
  screenModule,
  localeModule,
  timezoneModule,
  webrtcModule,
];

const STATUS_LABEL: Record<ScanProgressEvent['status'], string> = {
  running: '採集中…',
  completed: '完成',
  failed: '失敗',
};

export default function ScanPanel({
  consent,
  onComplete,
}: {
  consent: ConsentState;
  onComplete: (signals: NormalizedSignal[], elapsedMs: number) => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgressEvent[]>([]);
  const [error, setError] = useState<string>();

  const scan = async () => {
    setScanning(true);
    setProgress([]);
    setError(undefined);
    const startedAt = performance.now();

    try {
      const sdk = new ShieldScanSDK({ sdkVersion: '0.1.0' });
      for (const module of MODULES) sdk.register(module);
      const session = await sdk.scan();
      session.onProgress((event) => {
        setProgress((prev) => [
          ...prev.filter((p) => p.moduleId !== event.moduleId),
          event,
        ]);
      });
      const signals = await session.waitForCompletion();
      onComplete(signals, Math.round(performance.now() - startedAt));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  const completed = progress.filter((p) => p.status === 'completed').length;
  const overallPercent =
    progress.length === 0 ? 0 : Math.round((completed / MODULES.length) * 100);

  return (
    <section className="card">
      <h2>一鍵掃描</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        採集 10 項訊號：UA / Client Hints / Canvas / WebGL / WebGPU / Audio /
        螢幕 / 語言 / 時區 / WebRTC。模式：<strong>{consent.mode}</strong>
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-primary" onClick={scan} disabled={scanning}>
          {scanning ? `掃描中… ${overallPercent}%` : '開始掃描'}
        </button>
        {progress.length > 0 && (
          <span className="muted">
            已完成 {completed}/{MODULES.length}
          </span>
        )}
      </div>

      {error && <p style={{ color: 'var(--bad)' }}>掃描失敗：{error}</p>}

      {progress.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {[...progress]
            .sort((a, b) => a.index - b.index)
            .map((p) => (
              <div className="progress-row" key={p.moduleId}>
                <span>
                  {p.status === 'completed'
                    ? '✅'
                    : p.status === 'failed'
                      ? '❌'
                      : '⏳'}
                </span>
                <span style={{ minWidth: 170 }}>{p.moduleName}</span>
                <span className="muted">{STATUS_LABEL[p.status]}</span>
                {p.status === 'completed' && (
                  <span className="muted">{p.durationMs} ms</span>
                )}
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
