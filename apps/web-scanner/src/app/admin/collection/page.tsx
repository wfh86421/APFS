import type { Metadata } from 'next';
import AdminPage from '../../../components/admin-page';

export const metadata: Metadata = {
  title: 'ShieldScan 偵測採集設定 Collection',
  description: '掃描偵測採集模組（6+1）啟停／排序與資料欄位字典；後台版面請到 /admin/layout。',
};

export default function Page() {
  return <AdminPage hideHomeTab />;
}
