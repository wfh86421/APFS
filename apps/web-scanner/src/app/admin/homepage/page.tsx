import type { Metadata } from 'next';
import HomepageConfig from '../../../components/admin/homepage-config';

export const metadata: Metadata = {
  title: 'ShieldScan 首頁區塊設定',
  description: '管理者自訂首頁各區塊顯示與排序（記憶於瀏覽器）。',
};

export default function Page() {
  return <HomepageConfig />;
}
