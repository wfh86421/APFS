'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV: Array<{ href: string; label: string; icon: string; ready: boolean }> = [
  { href: '/admin', label: '管理者工作台', icon: '🛠️', ready: true },
  { href: '/admin/overview', label: '管理概覽', icon: '📊', ready: false },
  { href: '/admin/modules', label: '模組市場', icon: '🧩', ready: false },
  { href: '/admin/settings', label: '設定', icon: '⚙️', ready: false },
];

export default function AdminNav({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const pathname = usePathname();

  const logout = () => {
    if (window.confirm('登出功能尚未串接帳號系統，先回到網站首頁。')) {
      window.location.href = '/';
    }
  };

  const showUpdate = () => {
    window.alert('目前已是最新版本（MVP 預覽）。');
  };

  return (
    <aside className="admin-nav" aria-label="管理側邊欄">
      <button
        type="button"
        className="admin-nav-brand"
        onClick={onToggleCollapse}
        title={collapsed ? '展開側邊欄' : '收起側邊欄'}
        aria-label={collapsed ? '展開側邊欄' : '收起側邊欄'}
      >
        <span className="admin-nav-mark">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" />
          </svg>
        </span>
        <span className="admin-nav-brand-text">ShieldScan</span>
        <span className="admin-nav-brand-toggle" aria-hidden="true">
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="14" height="12" rx="2" />
            <line x1="8" y1="4" x2="8" y2="16" />
          </svg>
        </span>
        <span className="admin-nav-brand-hover-label" aria-hidden="true">
          展開側欄
        </span>
      </button>
      <nav>
        {NAV.map((item) => {
          const active = pathname === item.href;
          if (!item.ready) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className="admin-nav-item"
                title={item.label}
              >
                <span>{item.icon}</span>
                <span className="admin-nav-item-text">{item.label}</span>
                <span className="soon-tag">規劃中</span>
              </Link>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-nav-item${active ? ' active' : ''}`}
              title={item.label}
            >
              <span>{item.icon}</span>
              <span className="admin-nav-item-text">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="admin-nav-foot">
        <div className="agent-line">
          <span className="dot on" />
          <span className="admin-nav-item-text">Agent 線上</span>
          <button className="update-btn" onClick={showUpdate} title="檢查更新">
            <span className="dot update-dot" />
            <span className="admin-nav-item-text">更新可用</span>
          </button>
        </div>
        <div className="admin-user">
          <span className="avatar">A</span>
          <span className="admin-nav-item-text">
            <b>admin</b>
            <small>管理者</small>
          </span>
          <button className="mini-icon-btn logout-btn" onClick={logout} title="登出">
            ⎋
          </button>
        </div>
      </div>
    </aside>
  );
}
