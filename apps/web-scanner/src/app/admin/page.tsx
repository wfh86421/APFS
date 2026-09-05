import type { Metadata } from 'next';
import AdminPage from '../../components/admin-page';

export const metadata: Metadata = {
  title: 'ShieldScan 管理者工作台',
  description: '開啟／關閉、顯示／隱藏與排序工作台模組。',
};

export default function Page() {
  return <AdminPage />;
}
