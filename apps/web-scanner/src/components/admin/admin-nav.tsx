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
      <div className="admin-nav-brand">
        <span className="admin-nav-mark">🛡</span>
        <span className="admin-nav-brand-text">ShieldScan</span>
        <button
          className="admin-collapse admin-nav-collapse"
          onClick={onToggleCollapse}
          title={collapsed ? '展開側邊欄' : '收起側邊欄'}
          aria-label={collapsed ? '展開側邊欄' : '收起側邊欄'}
        >
          {collapsed ? '▸' : '◂'}
        </button>
      </div>
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
