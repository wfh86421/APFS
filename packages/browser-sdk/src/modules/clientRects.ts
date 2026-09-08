import type { DetectionModule } from '../index.js';

/**
 * Client Rects 指紋（版面排版佈局特徵）。
 *
 * 對固定文字元素取 getClientRects()，hash 其矩形序列（含四捨五入座標/尺寸），
 * 反映瀏覽器排版引擎與作業系統的細節差異（FontMetrics/字體替換規則等）。
 * 跨 session 同環境穩定，可作為跨 IP 設備聚類的輔助特徵。
 */
export const clientRectsModule: DetectionModule = {
  id: 'browser.clientRects',
  name: '版面排版指紋（Client Rects）',
  category: 'browser',
  version: '0.1.0',
  priority: 46,
  async collect() {
    if (typeof document === 'undefined') {
      return { key: 'clientRects', value: { supported: false }, confidence: 1 };
    }
    try {
      const el = document.createElement('div');
      el.textContent = 'The quick brown fox jumps over the lazy dog 0123456789';
      el.style.cssText =
        'position:absolute;left:-9999px;top:0;visibility:hidden;' +
        'font:48px Arial,sans-serif;line-height:normal;letter-spacing:normal;' +
        'word-spacing:normal;white-space:nowrap;padding:0;margin:0;border:0;';
      document.body.appendChild(el);
      const rects = Array.from(el.getClientRects()).map((r) =>
        [r.top, r.left, r.width, r.height].map((n) => Math.round(n * 100) / 100).join(','),
      );
      const value = {
        supported: true,
        rectCount: rects.length,
        width: el.offsetWidth,
        height: el.offsetHeight,
      };
      el.remove();
      return {
        key: 'clientRects',
        value,
        hash: await sha256(`${value.width}|${value.height}|${value.rectCount}|${rects.join(';')}`),
        confidence: 0.85,
      };
    } catch {
      return { key: 'clientRects', value: { supported: false }, confidence: 1 };
    }
  },
  getEntropy: () => 6,
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
