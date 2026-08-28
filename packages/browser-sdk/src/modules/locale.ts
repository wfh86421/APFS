import type { DetectionModule } from '../index.js';

/** 語言環境：navigator.language vs Intl API 交叉驗證。 */
export const localeModule: DetectionModule = {
  id: 'browser.locale',
  name: '語言環境',
  category: 'browser',
  version: '0.1.0',
  priority: 60,
  async collect() {
    return {
      key: 'locale',
      value: {
        language: navigator.language,
        languages: [...navigator.languages],
        intlLocale: new Intl.DateTimeFormat().resolvedOptions().locale,
      },
      confidence: 1,
    };
  },
  getEntropy: () => 5,
};
