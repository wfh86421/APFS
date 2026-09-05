import type { Metadata } from 'next';
import AdminOverview from '../../../components/admin/overview';

export const metadata: Metadata = {
  title: 'ShieldScan 管理概覽',
  description: '租戶報告、風險事件與設備指紋統計。',
};

export default function Page() {
  return <AdminOverview />;
}
