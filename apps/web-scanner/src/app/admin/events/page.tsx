import type { Metadata } from 'next';
import AdminEventsList from '../../../components/admin/events-list';

export const metadata: Metadata = {
  title: 'ShieldScan 企業 Dashboard — 事件查詢',
  description: '風險事件查詢與篩選。',
};

export default function Page() {
  return <AdminEventsList />;
}
