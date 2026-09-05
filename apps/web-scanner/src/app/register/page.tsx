import type { Metadata } from 'next';
import RegisterForm from '../../components/register-form';

export const metadata: Metadata = {
  title: 'ShieldScan API 自助註冊',
  description: '建立租戶並取得 API Key。',
};

export default function Page() {
  return <RegisterForm />;
}
