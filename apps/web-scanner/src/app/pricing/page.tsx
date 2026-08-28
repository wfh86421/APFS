import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '定價 — ShieldScan 隱盾檢測',
};

const PLANS = [
  {
    name: 'Free',
    price: 'NT$0',
    period: '/月',
    features: [
      '每月 1,000 次 API 呼叫',
      '瀏覽器 SDK（10 個採集模組）',
      '基礎評分與報告',
      '社群支援',
    ],
    cta: '開始使用',
    highlight: false,
  },
  {
    name: 'Developer',
    price: 'NT$2,500',
    period: '/月',
    features: [
      '每月 10,000 次 API 呼叫',
      '正式簽章（報告完整性驗證）',
      'Webhook 風險通知',
      'Node / React SDK',
      'Email 支援',
    ],
    cta: '註冊 Developer',
    highlight: true,
  },
  {
    name: 'Business',
    price: 'NT$25,000',
    period: '/月起',
    features: [
      '每月 100,000 次 API 呼叫',
      'L0/L1 網路層分析（Proxy/VPN/Tor）',
      '租戶管理與多 API Key',
      '發票與用量儀表板',
      '優先支援',
    ],
    cta: '聯絡我們',
    highlight: false,
  },
  {
    name: 'Enterprise',
    price: '報價制',
    period: '',
    features: [
      '行動端 SDK（Android/iOS/WebView）',
      '私有化部署',
      'SLA 與專屬支援',
      '資料產品與基準庫',
    ],
    cta: '預約 Demo',
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <main>
      <h1>定價</h1>
      <p className="subtitle">
        從免費開始，開發者 10 分鐘內串接；用量超額 NT$1/次。
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        {PLANS.map((plan) => (
          <section
            className="card"
            key={plan.name}
            style={{
              marginTop: 0,
              borderColor: plan.highlight ? 'var(--accent)' : undefined,
            }}
          >
            <h2 style={{ marginTop: 0 }}>{plan.name}</h2>
            <div className="score-gauge">
              <span className="score-number" style={{ fontSize: 30 }}>
                {plan.price}
              </span>
              <span className="muted">{plan.period}</span>
            </div>
            <ul style={{ paddingLeft: 18, lineHeight: 1.8 }}>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <button className={`btn ${plan.highlight ? 'btn-primary' : ''}`}>
              {plan.cta}
            </button>
          </section>
        ))}
      </div>

      <p className="muted" style={{ marginTop: 24, fontSize: 13 }}>
        計費週期以自然月計算；Free 與付費方案皆含每月 1,000 單位免費額度，
        超量 NT$1/單位。Enterprise 為報價制，含私有化部署與資料產品。
      </p>
      <p style={{ marginTop: 12 }}>
        <a href="/">← 返回掃描頁</a>
      </p>
    </main>
  );
}
