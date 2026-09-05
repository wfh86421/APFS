import type { Metadata } from 'next';
import AdminReportsList from '../../../components/admin/reports-list';

export const metadata: Metadata = {
  title: 'ShieldScan 企業 Dashboard — 報告列表',
  description: '租戶報告列表與事件查詢入口。',
};

export default function Page() {
  return <AdminReportsList />;
}
