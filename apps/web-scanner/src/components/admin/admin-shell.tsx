'use client';

import { useEffect, useState, type ReactNode } from 'react';
import AdminNav from './admin-nav';
import AdminTopbar from './admin-topbar';

type ThemeMode = 'light' | 'dark' | 'system';
type Lang = 'zh-TW' | 'en-US';

const THEME_KEY = 'shieldscan.admin.theme';
const LANG_KEY = 'shieldscan.admin.lang';

export default function AdminShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [lang, setLang] = useState<Lang>('zh-TW');

  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem(THEME_KEY) as ThemeMode | null;
      const savedLang = window.localStorage.getItem(LANG_KEY) as Lang | null;
      if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
        setTheme(savedTheme);
      }
      if (savedLang === 'zh-TW' || savedLang === 'en-US') setLang(savedLang);
    } catch {
      // 忽略儲存讀取失敗
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : theme;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // 忽略儲存寫入失敗
    }
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      document.documentElement.dataset.theme = media.matches ? 'light' : 'dark';
    };
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      window.localStorage.setItem(LANG_KEY, lang);
    } catch {
      // 忽略儲存寫入失敗
    }
  }, [lang]);

  const cycleTheme = () =>
    setTheme((current) => (current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light'));

  const cycleLang = () => setLang((current) => (current === 'zh-TW' ? 'en-US' : 'zh-TW'));

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen?.();
      }
    } catch {
      // 瀏覽器不允許時忽略
    }
  };

  return (
    <div className={`admin-frame${collapsed ? ' is-collapsed' : ''}`}>
      <AdminNav
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
      />
      <div className="admin-main">
        <AdminTopbar
          lang={lang}
          theme={theme}
          onCycleLang={cycleLang}
          onCycleTheme={cycleTheme}
          onToggleDesktop={toggleFullscreen}
        />
        <div className="admin-content">{children}</div>
      </div>
    </div>
  );
}
