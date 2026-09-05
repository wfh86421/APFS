'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TITLES: Record<string, string> = {
  '/admin': '管理者工作台',
  '/admin/overview': '管理概覽',
  '/admin/modules': '模組市場',
  '/admin/settings': '設定',
};

type ThemeMode = 'light' | 'dark' | 'system';
type Lang = 'zh-TW' | 'en-US';

const THEME_ICON: Record<ThemeMode, string> = {
  light: '☀️',
  dark: '🌙',
  system: '🖥️',
};

export default function AdminTopbar({
  lang,
  theme,
  onCycleLang,
  onCycleTheme,
  onToggleDesktop,
}: {
  lang: Lang;
  theme: ThemeMode;
  onCycleLang: () => void;
  onCycleTheme: () => void;
  onToggleDesktop: () => void;
}) {
  const pathname = usePathname();
  const title = TITLES[pathname] ?? '管理者';
  return (
    <header className="admin-topbar">
      <div className="admin-topbar-left">
        <span className="admin-crumb">控制台 / {title}</span>
      </div>
      <div className="admin-topbar-right">
        <span className="agent-chip">
          <span className="dot on" />
          Agent 線上
        </span>
        <button
          className="mini-icon-btn"
          onClick={onCycleLang}
          title={
            lang === 'zh-TW' ? '介面語言：繁體中文（EN 版規劃中）' : 'Interface language: English'
          }
        >
          {lang === 'zh-TW' ? '繁' : 'EN'}
        </button>
        <button
          className="mini-icon-btn"
          onClick={onToggleDesktop}
          title="進入桌面模式 / 離開桌面模式（全螢幕）"
        >
          ⛶
        </button>
        <button
          className="mini-icon-btn"
          onClick={onCycleTheme}
          title={
            theme === 'light'
              ? '目前：淺色 → 點按切到深色'
              : theme === 'dark'
                ? '目前：深色 → 點按切到跟隨系統'
                : '目前：跟隨系統 → 點按切到淺色'
          }
        >
          {THEME_ICON[theme]}
        </button>
        <Link className="btn admin-btn-sm" href="/">
          回到網站
        </Link>
        <span className="admin-user">
          <span className="avatar">A</span>
          <span>admin</span>
        </span>
      </div>
    </header>
  );
}
