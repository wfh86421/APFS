'use client';

import { useEffect, useState } from 'react';
import type { ModuleItem, ModuleKind, WorkspaceConfig } from '../modules/catalog';
import { KIND_LABEL } from '../modules/catalog';
import { moduleDataRef } from '../modules/module-data';
import {
  isWorkspaceConfigLike,
  loadWorkspaceConfig,
  moveCategory,
  moveModule,
  resetWorkspaceConfig,
  saveWorkspaceConfig,
  toggleCategoryFlag,
  toggleModuleFlag,
} from '../modules/store';
import { getAdminSiteConfig, putAdminSiteConfig } from '../lib/config-api';
import HomepageConfig from './admin/homepage-config';

function sortCategories(config: WorkspaceConfig) {
  return [...config.categories].sort((a, b) => a.order - b.order);
}

function modulesOf(config: WorkspaceConfig, categoryId: string): ModuleItem[] {
  return config.modules
    .filter((m) => m.categoryId === categoryId)
    .sort((a, b) => a.order - b.order);
}

function kindBadge(kind: ModuleKind) {
  return <span className="admin-kind">{KIND_LABEL[kind]}</span>;
}

function ModuleDataDetails({ module }: { module: ModuleItem }) {
  const ref = moduleDataRef(module.id);
  if (!ref) return null;
  return (
    <details className="admin-module-data">
      <summary>資料欄位＋API（{ref.fields.length}）</summary>
      <p className="admin-module-api">API：{ref.api}</p>
      <ul>
        {ref.fields.map((field) => (
          <li key={field.fieldPath}>
            <code>{field.fieldPath}</code> — {field.label}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function AdminPage() {
  const [config, setConfig] = useState<WorkspaceConfig | null>(null);
  const [tab, setTab] = useState<'modules' | 'home'>('modules');
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem('shieldscan.admin.apiKey') ?? '';
  });
  const [dbStatus, setDbStatus] = useState('');

  useEffect(() => {
    (async () => {
      const local = loadWorkspaceConfig();
      setConfig(local);
      const key = window.localStorage.getItem('shieldscan.admin.apiKey') ?? '';
      if (!key) return;
      try {
        const remote = await getAdminSiteConfig('workbench', key);
        if (isWorkspaceConfigLike(remote)) setConfig(remote);
      } catch {
        // 遠端失敗時沿用本機
      }
    })();
  }, []);

  if (!config) {
    return <div className="admin-page">載入中…</div>;
  }

  const commit = async (next: WorkspaceConfig) => {
    setConfig(next);
    saveWorkspaceConfig(next);
    if (apiKey) {
      try {
        await putAdminSiteConfig('workbench', next, apiKey);
        setDbStatus('已同步到資料庫 ✅');
      } catch (err) {
        setDbStatus(err instanceof Error ? err.message : String(err));
      }
    } else {
      setDbStatus('未填 API Key：僅本機記憶');
    }
  };

  const saveApiKey = (value: string) => {
    setApiKey(value);
    window.localStorage.setItem('shieldscan.admin.apiKey', value);
  };

  const categories = sortCategories(config);
  const enabledCount = config.modules.filter((m) => m.enabled).length;
  const shownModules = config.modules.filter((m) => m.visible).length;

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h1>管理者工作台</h1>
          <p className="muted">
            開啟／關閉功能、顯示／隱藏項目，並用上下箭頭調整順序。變更只影響目前瀏覽器（MVP）。
          </p>
        </div>
        <div className="admin-header-actions">
          <a className="btn" href="/">
            回網站
          </a>
          <button
            className="btn"
            onClick={() => {
              if (window.confirm('確定還原所有模組為預設值？')) {
                commit(resetWorkspaceConfig());
              }
            }}
          >
            還原預設
          </button>
        </div>
      </header>

      <div className="decision-config">
        <label>
          管理 API Key（同步到資料庫）
          <input
            type="password"
            value={apiKey}
            onChange={(event) => saveApiKey(event.target.value)}
            placeholder="shd_live_..."
          />
        </label>
      </div>
      {dbStatus && <p className="decision-status">{dbStatus}</p>}

      <div className="admin-tabs">
        <button
          className={tab === 'modules' ? 'admin-tab active' : 'admin-tab'}
          onClick={() => setTab('modules')}
        >
          後台模組（6＋1）
        </button>
        <button
          className={tab === 'home' ? 'admin-tab active' : 'admin-tab'}
          onClick={() => setTab('home')}
        >
          首頁區塊
        </button>
      </div>

      {tab === 'modules' && (
        <>
      <div className="admin-summary">
        <span>分類 {categories.filter((c) => c.visible).length}/{categories.length}</span>
        <span>顯示模組 {shownModules}/{config.modules.length}</span>
        <span>啟用模組 {enabledCount}/{config.modules.length}</span>
      </div>

      <div className="admin-shell">
        <aside className="admin-side">
          {categories.map((category, categoryIndex) => {
            const categoryModules = modulesOf(config, category.id);
            return (
              <section
                key={category.id}
                className={`admin-category${category.visible ? '' : ' is-hidden'}`}
              >
                <div className="admin-category-head">
                  <button
                    className="admin-caret"
                    title={category.collapsed ? '展開' : '收合'}
                    onClick={() => commit(toggleCategoryFlag(config, category.id, 'collapsed'))}
                  >
                    {category.collapsed ? '▸' : '▾'}
                  </button>
                  <span className="admin-category-icon">{category.icon}</span>
                  <span className="admin-category-label">{category.label}</span>
                  <span className="admin-spacer" />
                  <button
                    className="mini-btn"
                    title={category.visible ? '隱藏此分類' : '顯示此分類'}
                    onClick={() => commit(toggleCategoryFlag(config, category.id, 'visible'))}
                  >
                    {category.visible ? '👁️' : '🚫'}
                  </button>
                  <button
                    className="mini-btn"
                    title="上移分類"
                    disabled={categoryIndex === 0}
                    onClick={() => commit(moveCategory(config, category.id, -1))}
                  >
                    ↑
                  </button>
                  <button
                    className="mini-btn"
                    title="下移分類"
                    disabled={categoryIndex === categories.length - 1}
                    onClick={() => commit(moveCategory(config, category.id, 1))}
                  >
                    ↓
                  </button>
                </div>

                {!category.collapsed && (
                  <div className="admin-modules">
                    {categoryModules.map((module, moduleIndex) => (
                      <div key={module.id} className="admin-module-wrap">
                      <div
                        key={module.id}
                        className={`admin-module${module.visible ? '' : ' is-hidden'}${
                          module.enabled ? '' : ' is-disabled'
                        }`}
                      >
                        <span className="admin-module-icon">{module.icon}</span>
                        <span className="admin-module-label">
                          {module.label}
                          {kindBadge(module.kind)}
                        </span>
                        <span className="admin-spacer" />
                        <button
                          className="mini-btn"
                          title={module.enabled ? '停用（不參與掃描/分析）' : '啟用'}
                          onClick={() =>
                            commit(toggleModuleFlag(config, module.id, 'enabled'))
                          }
                        >
                          {module.enabled ? '⏻' : '○'}
                        </button>
                        <button
                          className="mini-btn"
                          title={module.visible ? '隱藏（仍參與功能）' : '顯示'}
                          onClick={() =>
                            commit(toggleModuleFlag(config, module.id, 'visible'))
                          }
                        >
                          {module.visible ? '👁️' : '🚫'}
                        </button>
                        <button
                          className="mini-btn"
                          title="上移"
                          disabled={moduleIndex === 0}
                          onClick={() => commit(moveModule(config, module.id, -1))}
                        >
                          ↑
                        </button>
                        <button
                          className="mini-btn"
                          title="下移"
                          disabled={moduleIndex === categoryModules.length - 1}
                          onClick={() => commit(moveModule(config, module.id, 1))}
                        >
                          ↓
                        </button>
                      </div>
                      <ModuleDataDetails module={module} />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </aside>

        <section className="admin-main">
          <h2>工作台預覽（依啟用＋顯示渲染）</h2>
          <div className="preview-groups">
            {categories
              .filter((c) => c.visible)
              .map((category) => {
                const visibleModules = modulesOf(config, category.id).filter(
                  (m) => m.visible,
                );
                if (visibleModules.length === 0) return null;
                return (
                  <section key={category.id} className="preview-group">
                    <h3>
                      {category.icon} {category.label}
                    </h3>
                    <div className="preview-grid">
                      {visibleModules.map((module) => (
                        <article
                          key={module.id}
                          className={`preview-card${
                            module.enabled ? '' : ' is-disabled'
                          }`}
                        >
                          <div className="preview-card-head">
                            <span>{module.icon}</span>
                            {kindBadge(module.kind)}
                          </div>
                          <b>{module.label}</b>
                          <p>{module.description}</p>
                          <span
                            className={`state-pill ${
                              module.enabled ? 'state-on' : 'state-off'
                            }`}
                          >
                            {module.enabled ? '已啟用' : '已停用'}
                          </span>
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
          </div>
          {shownModules === 0 && (
            <div className="preview-empty">目前沒有顯示中的模組，請在左側開啟顯示。</div>
          )}
        </section>
      </div>
        </>
      )}

      {tab === 'home' && <HomepageConfig embedded />}
    </div>
  );
}
