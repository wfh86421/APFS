import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'ShieldScan 隱盾檢測 — 瀏覽器指紋與網路環境安全檢測',
  description:
    '一站式瀏覽器指紋與網路環境安全檢測平台：即時隱私評分、風險預警與環境一致性驗證。',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
