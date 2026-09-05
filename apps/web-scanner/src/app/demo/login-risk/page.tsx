import type { Metadata } from 'next';
import LoginRiskDemo from '../../../components/demo/login-risk-demo';

export const metadata: Metadata = {
  title: 'ShieldScan 登入風控 Demo',
  description: '登入/註冊前環境風險檢查。',
};

export default function Page() {
  return <LoginRiskDemo />;
}
