import type { Metadata } from 'next';
import AdminPage from '../../../components/admin-page';

export const metadata: Metadata = {
  title: 'ShieldScan 進階工作台（舊版 6+1）',
  description: '舊版掃描模組（6+1）與首頁區塊設定；一般版面調整請到 /admin/layout。',
};

export default function Page() {
  return (
    <>
      <p style={{ padding: '0 0 10px', margin: 0, fontSize: 13, color: '#8fa2ba' }}>
        舊版工作台：掃描「採集模組（6+1）」啟停與排序、首頁區塊設定。版面（後台各頁顯示）已移到{' '}
        <a href="/admin/layout">版面設定</a>；戰情室首頁見 <a href="/admin">管理者工作台</a>。
      </p>
      <AdminPage />
    </>
  );
}
