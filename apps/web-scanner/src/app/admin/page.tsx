import type { Metadata } from 'next';
import AdminWarRoom from '../../components/admin/war-room';

export const metadata: Metadata = {
  title: 'ShieldScan 戰情室 Command Center',
  description: '管理者中樞：態勢感知／決策成效／治理延伸，各作戰單元入口可自行整理排序。',
};

export default function Page() {
  return <AdminWarRoom />;
}
