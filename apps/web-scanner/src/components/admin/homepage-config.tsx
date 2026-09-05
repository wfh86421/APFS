'use client';

import { useEffect, useState } from 'react';
import type { HomeConfig } from '../../modules/homepage';
import {
  loadHomeConfig,
  moveHomeBlock,
  resetHomeConfig,
  saveHomeConfig,
  toggleHomeFlag,
} from '../../modules/homepage';

export default function HomepageConfig() {
  const [config, setConfig] = useState<HomeConfig | null>(null);

  useEffect(() => {
    setConfig(loadHomeConfig());
  }, []);

  if (!config) return <div className="admin-page">載入中…</div>;

  const commit = (next: HomeConfig) => {
    setConfig(next);
    saveHomeConfig(next);
  };
  const blocks = [...config.blocks].sort((a, b) => a.order - b.order);

  return (
    <div className="admin-page">
      <h1>首頁區塊設定</h1>
      <p className="muted">
        開啟／關閉與顯示／隱藏首頁各區塊，排序會記住；下次開啟維持一致。
      </p>
      <div className="admin-header-actions" style={{ marginBottom: 12 }}>
        <button
          className="btn"
          onClick={() => {
            if (window.confirm('還原首頁區塊為預設？')) commit(resetHomeConfig());
          }}
        >
          還原預設
        </button>
        <a className="btn" href="/">
          檢視首頁
        </a>
      </div>
      <div className="admin-side">
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
                onClick={() => commit(toggleHomeFlag(config, block.id, 'enabled'))}
              >
                {block.enabled ? '⏻' : '○'}
              </button>
              <button
                className="mini-btn"
                title={block.visible ? '隱藏此區塊' : '顯示此區塊'}
                onClick={() => commit(toggleHomeFlag(config, block.id, 'visible'))}
              >
                {block.visible ? '👁️' : '🚫'}
              </button>
              <button
                className="mini-btn"
                disabled={index === 0}
                onClick={() => commit(moveHomeBlock(config, block.id, -1))}
              >
                ↑
              </button>
              <button
                className="mini-btn"
                disabled={index === blocks.length - 1}
                onClick={() => commit(moveHomeBlock(config, block.id, 1))}
              >
                ↓
              </button>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
