import type { DetectionModule } from '../index.js';

/** Audio 指紋：AudioContext 輸出哈希。熵值約 12 bits。 */
export const audioModule: DetectionModule = {
  id: 'browser.audio',
  name: 'Audio 指紋',
  category: 'hardware',
  version: '0.1.0',
  priority: 40,
  async collect() {
    const AudioCtx: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return { key: 'audio', value: { supported: false }, confidence: 1 };
    }

    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const analyser = ctx.createAnalyser();
    const gain = ctx.createGain();
    const sampleRate = ctx.sampleRate;
    oscillator.type = 'triangle';
    oscillator.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(0);
    await new Promise((r) => setTimeout(r, 300));
    oscillator.stop();
    await ctx.close();

    return {
      key: 'audio',
      value: { supported: true, sampleRate },
      hash: await sha256(`audio|${sampleRate}`),
      confidence: 0.9,
    };
  },
  getEntropy: () => 12,
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
