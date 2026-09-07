import type { Metadata } from 'next';
import DeviceRelations from '../../../../components/admin/device-relations';

export const metadata: Metadata = {
  title: 'ShieldScan 設備關聯圖譜',
  description: '裝置 ↔ session ↔ IP ↔ 帳號 關聯。',
};

export default async function Page({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  return <DeviceRelations fingerprintHash={hash} />;
}
