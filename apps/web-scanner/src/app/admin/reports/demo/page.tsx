import type { Metadata } from 'next';
import DecisionReportDemo from '../../../../components/admin/decision-report-demo';

export const metadata: Metadata = {
  title: 'ShieldScan 報告詳情決策頁（示範）',
  description: '依 6＋1 模組設定渲染的報告決策示範頁。',
};

export default function Page() {
  return <DecisionReportDemo />;
}
