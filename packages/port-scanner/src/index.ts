import net from 'node:net';

export interface PortScanResult {
  port: number;
  open: boolean;
  durationMs: number;
}

export interface ScanPortsOptions {
  timeoutMs?: number;
  concurrency?: number;
}

function probePort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    socket.connect(port, host);
  });
}

/**
 * 合規端口掃描。
 *
 * 安全限制（由呼叫端負責執行）：
 * - host 只能是請求者的來源 IP（不可掃任意目標）。
 * - 必須限流（例如每 IP 每小時 5 次）。
 * - 每次掃描必須寫入審計日誌。
 */
export async function scanPorts(
  host: string,
  ports: number[],
  options: ScanPortsOptions = {},
): Promise<PortScanResult[]> {
  const timeoutMs = options.timeoutMs ?? 1200;
  const concurrency = options.concurrency ?? 3;
  const results: PortScanResult[] = [];

  for (let i = 0; i < ports.length; i += concurrency) {
    const batch = ports.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (port) => {
        const started = performance.now();
        const open = await probePort(host, port, timeoutMs);
        return { port, open, durationMs: Math.round(performance.now() - started) };
      }),
    );
    results.push(...batchResults);
  }

  return results.sort((a, b) => a.port - b.port);
}
