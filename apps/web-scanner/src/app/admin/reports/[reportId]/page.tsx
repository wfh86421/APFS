import type { Metadata } from 'next';
import ReportDetailPage from '../../../../components/admin/report-detail';

export const metadata: Metadata = {
  title: 'ShieldScan 報告詳情',
  description: '依 6＋1 模組設定渲染真實報告。',
};

export default async function Page({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  return <ReportDetailPage reportId={reportId} />;
}
