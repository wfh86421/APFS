import type { DetectionModule } from '../index.js';

/** 時區指紋：Intl API 時區偏移與語言。 */
export const timezoneModule: DetectionModule = {
  id: 'browser.timezone',
  name: '時區指紋',
  category: 'browser',
  version: '0.1.0',
  priority: 70,
  async collect() {
    const resolved = new Intl.DateTimeFormat().resolvedOptions();
    const offset = -new Date().getTimezoneOffset() / 60;
    return {
      key: 'timezone',
      value: {
        timezone: resolved.timeZone,
        offsetHours: offset,
        localTime: new Date().toISOString(),
      },
      confidence: 1,
    };
  },
  getEntropy: () => 5,
};
