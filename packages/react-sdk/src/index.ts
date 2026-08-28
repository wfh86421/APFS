import { useEffect, useState } from 'react';
import { ShieldScanSDK, type DetectionModule } from '@shieldscan/browser-sdk';
import type { NormalizedSignal } from '@shieldscan/core-schema';

export interface UseShieldScanOptions {
  modules: DetectionModule[];
  autoScan?: boolean;
}

export interface UseShieldScanResult {
  signals: NormalizedSignal[];
  scanning: boolean;
  error?: Error;
  scan: () => Promise<void>;
}

/** React Hook：包裝 ShieldScanSDK，供 React 應用快速整合。 */
export function useShieldScan(options: UseShieldScanOptions): UseShieldScanResult {
  const [signals, setSignals] = useState<NormalizedSignal[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<Error | undefined>();

  const scan = async () => {
    setScanning(true);
    setError(undefined);
    try {
      const sdk = new ShieldScanSDK({ sdkVersion: '0.1.0' });
      for (const module of options.modules) sdk.register(module);
      const session = await sdk.scan();
      setSignals(await session.waitForCompletion());
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    if (options.autoScan) void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { signals, scanning, error, scan };
}
