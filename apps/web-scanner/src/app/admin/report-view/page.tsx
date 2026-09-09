import type { Metadata } from 'next';
import AdminPage from '../../../components/admin-page';

export const metadata: Metadata = {
  title: 'ShieldScan 報告檢視設定 Report View',
  description: '報告詳情頁區塊模組（6+1）啟停／排序與資料字典；公開版面請到 /admin/layout。',
};

export default function Page() {
  return <AdminPage hideHomeTab />;
}
