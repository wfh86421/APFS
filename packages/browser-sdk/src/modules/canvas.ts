import type { DetectionModule } from '../index.js';

/** Canvas 指紋：2D 渲染像素哈希 + 篡改偵測。熵值約 15 bits。 */
export const canvasModule: DetectionModule = {
  id: 'browser.canvas',
  name: 'Canvas 指紋',
  category: 'hardware',
  version: '0.1.0',
  priority: 10,
  async collect() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { key: 'canvas', value: { supported: false }, confidence: 1 };
    }

    canvas.width = 200;
    canvas.height = 50;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 200, 50);
    ctx.fillStyle = '#069';
    ctx.font = '16px Arial';
    ctx.fillText('ShieldScan v0.1 🎨', 10, 30);

    const dataUrl = canvas.toDataURL();
    const isTampered =
      HTMLCanvasElement.prototype.toDataURL.toString() !==
      'function toDataURL() { [native code] }';

    return {
      key: 'canvas',
      value: {
        supported: true,
        dataUrlLength: dataUrl.length,
        isTampered,
      },
      hash: await sha256(dataUrl),
      confidence: 0.95,
    };
  },
  getEntropy: () => 15,
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
