/**
 * 產生 RFC4122 v4 UUID。
 *
 * 瀏覽器只在安全環境（https / localhost）才提供 crypto.randomUUID；
 * 以 http + 對外 IP 部署（例如 VPS）時該函式為 undefined，會直接拋錯。
 * 這裡提供後備，確保匿名掃描在任何環境都能產生報告 id / session id。
 */
export function newUuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }

  // 設定版本（4）與 variant（10xx）。
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}
