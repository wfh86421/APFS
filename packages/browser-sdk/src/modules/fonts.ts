import { sha256 } from '../sha.js';
import type { DetectionModule } from '../index.js';

/**
 * 字體指紋（保守測寬法）。
 *
 * 用「font-family 帶不存在哨兵字型」的寬度差判定：只有該字型真的安裝、
 * 且其度量與預設 sans-serif 不同時才判定「已安裝」——寧可漏報（false negative）
 * 也不誤報，確保跨 session／跨瀏覽器版本 hash 穩定（供跨 session 設備聚類）。
 * CJK／程式碼／展示字型鑑別度高，是「IP 會變、指紋不變」的輔助特徵之一。
 */
const CANDIDATES = [
  // 系統/常見（度量常與預設相同者仍可被下兩組補上）
  'Arial',
  'Helvetica Neue',
  'Segoe UI',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  // CJK（高鑑別度，多數平台不預設）
  'PingFang TC',
  'Microsoft JhengHei',
  '微軟正黑體',
  'Noto Sans CJK TC',
  'Noto Sans TC',
  'SimSun',
  'PMingLiU',
  '新細明體',
  'DFKai-SB',
  '標楷體',
  'Meiryo',
  'Yu Gothic',
  'Malgun Gothic',
  'Apple SD Gothic Neo',
  // 程式/等寬
  'Consolas',
  'Menlo',
  'Monaco',
  'Courier New',
  'JetBrains Mono',
  'SF Mono',
  'Cascadia Mono',
  // 展示/襯線
  'Georgia',
  'Times New Roman',
  'Palatino Linotype',
  'Impact',
  'Trebuchet MS',
  'Tahoma',
  'Verdana',
  'Comic Sans MS',
  'Gill Sans',
  'Futura',
  'Didot',
  'Bodoni 72',
];

const PROBE_TEXT = 'mmmmmmmmmmlli';

export const fontsModule: DetectionModule = {
  id: 'browser.fonts',
  name: '字體指紋',
  category: 'browser',
  version: '0.1.0',
  priority: 45,
  async collect() {
    if (typeof document === 'undefined') {
      return { key: 'fonts', value: { supported: false }, confidence: 1 };
    }
    try {
      const detected: string[] = [];
      for (const name of CANDIDATES) {
        if (measure(name)) detected.push(name);
      }
      const value = { supported: true, detected, sampleSize: CANDIDATES.length, estimate: true };
      return {
        key: 'fonts',
        value,
        hash: await sha256(detected.join('|') || '__none__'),
        confidence: 0.8,
      };
    } catch {
      return { key: 'fonts', value: { supported: false, error: true }, confidence: 1 };
    }
  },
  getEntropy: () => 8,
};

function measure(family: string): boolean {
  const base = probeSpan('sans-serif');
  const probe = probeSpan(`"${family}","__shieldscan_missing_7f3a__",sans-serif`);
  const same = Math.abs(base.offsetWidth - probe.offsetWidth) < 0.5;
  base.remove();
  probe.remove();
  return !same;
}

function probeSpan(fontStack: string): HTMLElement {
  const el = document.createElement('span');
  el.textContent = PROBE_TEXT;
  el.style.cssText =
    'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;' +
    'font-size:48px;line-height:normal;padding:0;margin:0;';
  el.style.font = `48px ${fontStack}`;
  document.body.appendChild(el);
  return el;
}

