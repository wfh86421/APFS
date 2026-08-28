'use client';

import { useState } from 'react';
import {
  ShieldScanSDK,
  audioModule,
  canvasModule,
  localeModule,
  screenModule,
  timezoneModule,
  webglModule,
  webgpuModule,
  webrtcModule,
} from '@shieldscan/browser-sdk';
import type { NormalizedSignal } from '@shieldscan/core-schema';

const modules = [
  canvasModule,
  webglModule,
  webgpuModule,
  audioModule,
  screenModule,
  localeModule,
  timezoneModule,
  webrtcModule,
];

export default function Home() {
  const [signals, setSignals] = useState<NormalizedSignal[]>([]);
  const [scanning, setScanning] = useState(false);

  const scan = async () => {
    setScanning(true);
    try {
      const sdk = new ShieldScanSDK({ sdkVersion: '0.1.0' });
      for (const m of modules) sdk.register(m);
      const session = await sdk.scan();
      setSignals(await session.waitForCompletion());
    } finally {
      setScanning(false);
    }
  };

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 32, fontFamily: 'sans-serif' }}>
      <h1>ShieldScan 隱盾檢測</h1>
      <p>一鍵掃描瀏覽器指紋與環境訊號（MVP 雛形）。</p>
      <button onClick={scan} disabled={scanning}>
        {scanning ? '掃描中…' : '開始掃描'}
      </button>
      {signals.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 24 }}>
          <thead>
            <tr>
              <th align="left">模組</th>
              <th align="left">類別</th>
              <th align="left">數值摘要</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((s) => (
              <tr key={s.id}>
                <td>{s.pluginId}</td>
                <td>{s.category}</td>
                <td style={{ wordBreak: 'break-all' }}>
                  {JSON.stringify(s.value).slice(0, 120)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
