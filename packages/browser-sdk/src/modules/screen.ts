import type { DetectionModule } from '../index.js';

/** 螢幕指紋：解析度、色彩深度、DPR、觸控點數。熵值約 8 bits。 */
export const screenModule: DetectionModule = {
  id: 'browser.screen',
  name: '螢幕指紋',
  category: 'hardware',
  version: '0.1.0',
  priority: 50,
  async collect() {
    return {
      key: 'screen',
      value: {
        resolution: `${screen.width}x${screen.height}`,
        availResolution: `${screen.availWidth}x${screen.availHeight}`,
        colorDepth: screen.colorDepth,
        devicePixelRatio: window.devicePixelRatio,
        maxTouchPoints: navigator.maxTouchPoints,
      },
      confidence: 1,
    };
  },
  getEntropy: () => 8,
};
