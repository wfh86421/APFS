'use client';

import { useEffect, useState } from 'react';
import type { HomeConfig } from '../../modules/homepage';
import {
  isHomeConfigLike,
  loadHomeConfig,
  moveHomeBlock,
  resetHomeConfig,
  saveHomeConfig,
  toggleHomeFlag,
} from '../../modules/homepage';
import { getAdminSiteConfig, getPublicSiteConfig, putAdminSiteConfig } from '../../lib/config-api';

export default function HomepageConfig({ embedded = false }: { embedded?: boolean }) {
  const [config, setConfig] = useState<HomeConfig | null>(null);
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem('shieldscan.admin.apiKey') ?? '';
  });
  const [status, setStatus] = useState('');

  useEffect(() => {
    (async () => {
      const remote = await getPublicSiteConfig('homepage');
      if (isHomeConfigLike(remote)) {
        setConfig(remote);
        return;
      }
      setConfig(loadHomeConfig());
    })();
  }, []);

  if (!config) return <div className="admin-page">載入中…</div>;

  const commit = async (next: HomeConfig) => {
    setConfig(next);
    saveHomeConfig(next);
    if (apiKey) {
      try {
        await putAdminSiteConfig('homepage', next, apiKey);
        setStatus('已同步到資料庫 ✅');
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
      }
    } else {
      setStatus('未填 API Key：僅本機記憶');
    }
  };

  const syncRemote = async () => {
    window.localStorage.setItem('shieldscan.admin.apiKey', apiKey);
    if (!apiKey) {
      setStatus('請先填入管理 API Key。');
      return;
    }
    try {
      const remote = await getAdminSiteConfig('homepage', apiKey);
      if (isHomeConfigLike(remote)) {
        setConfig(remote);
        setStatus('已從資料庫載入 ✅');
      } else {
        setStatus('資料庫尚無設定，目前使用本機預設');
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const blocks = [...config.blocks].sort((a, b) => a.order - b.order);
  return (
    <section className={embedded ? 'admin-page' : 'admin-page'}>
      {!embedded && <h1>首頁區塊設定</h1>}
      <p className="muted">
        開啟／關閉與顯示／隱藏首頁各區塊，排序會記住；填入 API Key 後同步到資料庫，全裝置一致。
      </p>
      <div className="decision-config">
        <label>
          管理 API Key
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="shd_live_..."
          />
        </label>
        <button className="btn" onClick={syncRemote}>
          從資料庫載入
        </button>
        <button
          className="btn"
          onClick={() => {
            if (window.confirm('還原首頁區塊為預設？')) void commit(resetHomeConfig());
          }}
        >
          還原預設
        </button>
        <a className="btn" href="/">
          檢視首頁
        </a>
      </div>
      {status && <p className="decision-status">{status}</p>}
      <div className="admin-side" style={{ marginTop: 12 }}>
        {blocks.map((block, index) => (
          <section
            key={block.id}
            className={`admin-category${block.visible ? '' : ' is-hidden'}`}
          >
            <div className="admin-category-head">
              <span className="admin-category-icon">{block.icon}</span>
              <span className="admin-category-label">{block.label}</span>
              <span className="admin-spacer" />
              <button
                className="mini-btn"
                title={block.enabled ? '停用此區塊功能' : '啟用此區塊功能'}
                onClick={() => void commit(toggleHomeFlag(config, block.id, 'enabled'))}
              >
                {block.enabled ? '⏻' : '○'}
              </button>
              <button
                className="mini-btn"
                title={block.visible ? '隱藏此區塊' : '顯示此區塊'}
                onClick={() => void commit(toggleHomeFlag(config, block.id, 'visible'))}
              >
                {block.visible ? '👁️' : '🚫'}
              </button>
              <button
                className="mini-btn"
                disabled={index === 0}
                onClick={() => void commit(moveHomeBlock(config, block.id, -1))}
              >
                ↑
              </button>
              <button
                className="mini-btn"
                disabled={index === blocks.length - 1}
                onClick={() => void commit(moveHomeBlock(config, block.id, 1))}
              >
                ↓
              </button>
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
