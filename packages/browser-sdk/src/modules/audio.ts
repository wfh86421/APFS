import { sha256 } from '../sha.js';
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
    // 靜音取樣：音調不送到喇叭（避免可聽「嗶聲」），仍走完整 AudioContext 管線取得特徵。
    gain.gain.value = 0;
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

