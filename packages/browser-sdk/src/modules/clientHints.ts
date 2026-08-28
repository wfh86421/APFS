import type { DetectionModule } from '../index.js';

/**
 * Client Hints 指紋：navigator.userAgentData（Sec-CH-UA 家族）。
 * 用於與 UA/Platform 交叉驗證（os_mismatch 等一致性檢查）。
 * 熵值約 4 bits。
 */
export const clientHintsModule: DetectionModule = {
  id: 'browser.clientHints',
  name: 'Client Hints',
  category: 'browser',
  version: '0.1.0',
  priority: 8,
  async collect() {
    const uad = navigator.userAgentData;
    if (!uad) {
      return { key: 'clientHints', value: { supported: false }, confidence: 1 };
    }

    const highEntropy = await uad
      .getHighEntropyValues([
        'architecture',
        'bitness',
        'model',
        'platformVersion',
        'fullVersionList',
        'uaFullVersion',
      ])
      .catch(() => null);

    return {
      key: 'clientHints',
      value: {
        supported: true,
        brands: uad.brands,
        mobile: uad.mobile,
        platform: uad.platform,
        architecture: highEntropy?.architecture ?? null,
        bitness: highEntropy?.bitness ?? null,
        model: highEntropy?.model ?? null,
        platformVersion: highEntropy?.platformVersion ?? null,
        fullVersionList: highEntropy?.fullVersionList ?? null,
        uaFullVersion: highEntropy?.uaFullVersion ?? null,
      },
      confidence: 0.95,
    };
  },
  getEntropy: () => 4,
};
