import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '隱私政策 — ShieldScan 隱盾檢測',
};

export default function PrivacyPage() {
  return (
    <main>
      <h1>隱私政策</h1>
      <p className="subtitle">最後更新：2026-08-28（Phase 1 版本）</p>

      <section className="card">
        <h2>我們收集什麼</h2>
        <p>
          掃描過程會在瀏覽器內採集指紋與環境訊號：User-Agent、Client Hints、
          Canvas / WebGL / WebGPU / Audio 指紋、螢幕資訊、語言、時區與
          WebRTC 回報的 IP 訊號。
        </p>
      </section>

      <section className="card">
        <h2>三種同意模式</h2>
        <dl className="kv">
          <dt>僅本機（local-only）</dt>
          <dd>
            所有訊號只在瀏覽器內分析，不傳送到伺服器，也不儲存任何資料。
          </dd>
          <dt>標準（standard）</dt>
          <dd>
            傳送匿名化訊號到伺服器進行風險分析，不保留個人識別資料。
          </dd>
          <dt>保留分析（stored）</dt>
          <dd>
            同意匿名化資料儲存 90 天，用於建立正常基準線與風險模型。
          </dd>
        </dl>
      </section>

      <section className="card">
        <h2>資料處理原則</h2>
        <ul>
          <li>預設匿名化：原始指紋與帳號資料分離，以雜湊關聯。</li>
          <li>可刪除：可隨時清除本機儲存的同意設定與歷史資料。</li>
          <li>不追蹤：平台本身不使用指紋進行追蹤或廣告投放。</li>
          <li>明示用途：每個扣分項都會說明「為什麼」與「如何修復」。</li>
        </ul>
      </section>

      <section className="card">
        <h2>聯絡方式</h2>
        <p>
          如需刪除資料或詢問隱私事宜，請透過專案
          <a href="https://github.com/wfh86421/APFS"> GitHub 儲存庫</a>
          提出 Issue。
        </p>
      </section>

      <p style={{ marginTop: 24 }}>
        <a href="/">← 返回掃描頁</a>
      </p>
    </main>
  );
}
