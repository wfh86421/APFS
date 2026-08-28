import type { DetectionModule } from '../index.js';

/** WebGL 指紋：GPU Vendor/Renderer、參數與擴充。熵值約 20 bits。 */
export const webglModule: DetectionModule = {
  id: 'browser.webgl',
  name: 'WebGL 指紋',
  category: 'hardware',
  version: '0.1.0',
  priority: 20,
  async collect() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    if (!gl) {
      return { key: 'webgl', value: { supported: false }, confidence: 1 };
    }

    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = ext
      ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL))
      : String(gl.getParameter(gl.VENDOR));
    const renderer = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));

    return {
      key: 'webgl',
      value: { supported: true, vendor, renderer },
      hash: await sha256(`${vendor}|${renderer}`),
      confidence: 0.95,
    };
  },
  getEntropy: () => 20,
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
