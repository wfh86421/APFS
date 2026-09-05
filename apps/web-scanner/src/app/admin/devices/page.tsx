import type { Metadata } from 'next';
import AdminDevicesList from '../../../components/admin/devices-list';

export const metadata: Metadata = {
  title: 'ShieldScan 企業 Dashboard — 設備指紋聚類',
  description: '跨 session 設備指紋聚類查詢。',
};

export default function Page() {
  return <AdminDevicesList />;
}
