import type { DetectionModule } from '../index.js';

/**
 * UA 指紋：userAgent、platform、vendor、語言與 Navigator 基礎屬性。
 * 熵值約 6 bits。
 */
export const uaModule: DetectionModule = {
  id: 'browser.ua',
  name: 'User-Agent / Platform',
  category: 'browser',
  version: '0.1.0',
  priority: 5,
  async collect() {
    return {
      key: 'ua',
      value: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        vendor: navigator.vendor,
        language: navigator.language,
        cookieEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack ?? null,
      },
      confidence: 1,
    };
  },
  getEntropy: () => 6,
};
