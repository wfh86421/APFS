import Link from 'next/link';

const LABELS: Record<string, string> = {
  overview: '管理概覽',
  modules: '模組市場',
  settings: '設定',
};

export const metadata = {
  title: 'ShieldScan 管理 — 規劃中',
  description: '此區塊規劃中。',
};

export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const label = LABELS[section] ?? section;
  return (
    <div className="admin-page">
      <h1>{label}</h1>
      <p className="muted">此區塊目前規劃中，已開放的是「管理者工作台」。</p>
      <Link className="btn" href="/admin">
        前往管理者工作台
      </Link>
    </div>
  );
}
