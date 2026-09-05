import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ShieldScan 垂直場景 Demo',
  description: '看劇播放前檢查、登入風控、遊戲防作弊。',
};

const DEMOS = [
  {
    title: '登入風控 Demo',
    description: '登入/註冊前環境風險檢查，輸出 allow／challenge／review／block 建議。',
    href: '/demo/login-risk',
    status: '可試玩',
  },
  {
    title: '看劇播放前檢查',
    description: '帳號共享／地區繞過／批量播放偵測（待接播放器 SDK）。',
    href: '#',
    status: '規劃中',
  },
  {
    title: '遊戲防作弊',
    description: '模擬器／多開／Hook 偵測（待行動端 SDK）。',
    href: '#',
    status: '規劃中',
  },
];

export default function DemoPage() {
  return (
    <main>
      <h1>垂直場景 Demo</h1>
      <p className="subtitle">每個 Demo 都會接真實掃描與伺服器評分，供 Pilot 提案使用。</p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}
      >
        {DEMOS.map((demo) => (
          <section className="card" key={demo.title} style={{ marginTop: 0 }}>
            <h2 style={{ marginTop: 0 }}>{demo.title}</h2>
            <p className="muted">{demo.description}</p>
            <a className="btn" href={demo.href}>
              {demo.status}
            </a>
          </section>
        ))}
      </div>
      <p style={{ marginTop: 16 }}>
        <a href="/">← 返回掃描頁</a>
      </p>
    </main>
  );
}
