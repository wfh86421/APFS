import type { Metadata } from 'next';
import AdminRoiView from '../../../components/admin/roi-view';

export const metadata: Metadata = {
  title: 'ShieldScan 企業 Dashboard — 決策成效 ROI',
  description: 'Shadow/反事實與事後結果回饋的成效聚合（攔截詐欺金額、誤殺率）。',
};

export default function Page() {
  return <AdminRoiView />;
}
