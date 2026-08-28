'use client';

import type { ConsentMode } from '@shieldscan/core-schema';

const STORAGE_KEY = 'shieldscan.consent';

export interface ConsentState {
  mode: ConsentMode;
  retentionDays?: number;
}

const MODES: Array<{ mode: ConsentMode; label: string; description: string }> = [
  {
    mode: 'local-only',
    label: '僅本機（local-only）',
    description: '所有訊號只在瀏覽器內分析，不傳送到伺服器。',
  },
  {
    mode: 'standard',
    label: '標準（standard）',
    description: '傳送匿名化訊號到伺服器進行風險分析，不保留個人識別資料。',
  },
  {
    mode: 'stored',
    label: '保留分析（stored）',
    description: '同意匿名化資料儲存 90 天，用於建立基準線與風險模型。',
  },
];

export function loadConsent(): ConsentState {
  if (typeof window === 'undefined') return { mode: 'local-only' };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ConsentState;
      if (MODES.some((m) => m.mode === parsed.mode)) return parsed;
    }
  } catch {
    // 忽略損壞的儲存值，退回預設。
  }
  return { mode: 'local-only' };
}

export function saveConsent(consent: ConsentState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
}

export default function ConsentBanner({
  value,
  onChange,
}: {
  value: ConsentState;
  onChange: (consent: ConsentState) => void;
}) {
  return (
    <section className="card">
      <h2>資料使用同意</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        請選擇掃描資料的處理方式。詳細說明見
        <a href="/privacy"> 隱私政策</a>。
      </p>
      {MODES.map((option) => {
        const selected = value.mode === option.mode;
        return (
          <label
            key={option.mode}
            className={`consent-option${selected ? ' selected' : ''}`}
          >
            <input
              type="radio"
              name="consent-mode"
              checked={selected}
              onChange={() => {
                const next: ConsentState =
                  option.mode === 'stored'
                    ? { mode: option.mode, retentionDays: 90 }
                    : { mode: option.mode };
                onChange(next);
              }}
            />
            <span>
              <strong>{option.label}</strong>
              <br />
              <span className="muted">{option.description}</span>
            </span>
          </label>
        );
      })}
    </section>
  );
}
