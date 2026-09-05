'use client';

import { useState } from 'react';
import { loadWorkspaceConfig } from '../../modules/store';

const DEMO = {
  visitorId: '61849C57',
  reportId: 'report-demo-2026-0906',
  sessionId: 'session-demo-2026-0906',
  score: 78,
  riskLevel: 'High',
  confidence: 'Medium',
  recommendation: 'Manual Review',
};

const RISK_FACTORS = [
  {
    title: '開放端口 22 / 3389（疑似行動環境）',
    severity: 'High',
    confidence: 'Medium',
    explanation: '手機行動網路不應開放 SSH/RDP；疑似雲手機、模擬器或跳板機。',
  },
  {
    title: 'OS 版本衝突：UA Android 10 vs Platform Android 14',
    severity: 'Medium',
    confidence: 'Medium',
    explanation: '可能為 UA reduction、隱私瀏覽器或抹機工具痕跡。',
  },
  {
    title: 'DNS 洩漏（VPN 情境下）',
    severity: 'Contextual',
    confidence: 'Medium',
    explanation: '若使用者宣稱匿名/VPN，洩漏電信 DNS 屬高隱私風險。',
  },
];

const CONFLICTS = [
  { dimension: 'OS', claimed: 'Android 10（UA）', reality: 'Android 14.0.0（Platform）', verdict: '版本衝突', level: '⚠️ 中' },
  { dimension: '端口', claimed: '普通手機', reality: '監聽 22 / 3389', verdict: '端口異態', level: '🚨 高' },
  { dimension: 'DNS', claimed: '匿名/VPN', reality: '洩漏台灣固網 DNS', verdict: '隱私洩漏', level: '🟡 情境' },
  { dimension: 'WebRTC', claimed: '公網 IP', reality: '與 WebRTC 一致', verdict: '一致', level: '✅' },
  { dimension: 'Canvas', claimed: '標準瀏覽器', reality: 'hash 被重寫', verdict: '隱私防禦', level: 'ℹ️ 低' },
  { dimension: '地理', claimed: '台灣板橋', reality: 'IP 顯示板橋', verdict: '低置信一致', level: '✅' },
];

const HARDWARE = [
  ['GPU 製造商 / 型號', 'Qualcomm / Adreno (TM) 613'],
  ['CPU 核心 / RAM', '4 核 / 4 GB'],
  ['螢幕解析度', '1081 x 2401'],
  ['CSS Viewport', '393 x 873'],
  ['觸控支援 / 色深', '5 點 / 24-bit'],
  ['指紋群', 'Canvas 1BF213F7・WebGL 8F7C4485・Audio 0A4EB19B'],
];

const BROWSER = [
  ['瀏覽器', 'Brave 142.0.0.0'],
  ['真實 OS', 'Android 14.0.0'],
  ['UA 宣稱 OS', 'Android 10（衝突）'],
  ['語言', 'zh-TW / Accept-Language zh-TW'],
  ['無痕模式', 'No'],
  ['字體 hash', '0212F86A'],
];

const NETWORK = [
  ['公網 IP / ISP', '49.214.1.196 / Taiwan Fixed Network'],
  ['7 天 IP 活躍', '1 次（乾淨）'],
  ['WebRTC / STUN', '49.214.1.196 / 一致'],
  ['DNS 洩漏', '有（175.96.61.48 等 6 筆）'],
  ['開放端口', '22 (SSH)、3389 (RDP)'],
  ['地理位置', '台灣 / 新北板橋（低置信）'],
];

export default function DecisionReportDemo() {
  const config = loadWorkspaceConfig();
  const moduleIds = new Set(
    config.modules.filter((module) => module.enabled && module.visible).map((module) => module.id),
  );
  const show = (id: string) => moduleIds.has(id);
  const [rawOpen, setRawOpen] = useState(false);

  return (
    <div className="decision-page">
      <h1>報告詳情決策頁（示範資料）</h1>
      <p className="muted">
        依 `/admin` 的 6＋1 模組設定渲染；此頁使用示範報告，尚未串接租戶報告 API。
      </p>

      {show('decision.verdict') && (
        <section className="decision-card decision-hero">
          <div>
            <h2>① 決策樞紐與快速處置</h2>
            <p className="muted">
              Visitor <b>{DEMO.visitorId}</b>・Report {DEMO.reportId}
            </p>
            <div className="decision-score-row">
              <div>
                <b className="decision-score">{DEMO.score}</b>
                <span>/100</span>
              </div>
              <div className="decision-meta">
                <span className="badge badge-bad">Risk Level: {DEMO.riskLevel}</span>
                <span className="badge badge-warn">Confidence: {DEMO.confidence}</span>
                <span className="badge badge-warn">Action: {DEMO.recommendation}</span>
              </div>
            </div>
            <h3>Top Risk Factors</h3>
            {RISK_FACTORS.map((factor) => (
              <div className="decision-factor" key={factor.title}>
                <b>{factor.title}</b>
                <span>
                  Severity {factor.severity}・Confidence {factor.confidence}
                </span>
                <p>{factor.explanation}</p>
              </div>
            ))}
          </div>
          <div className="decision-actions">
            <button className="btn" onClick={() => window.alert('白名單動作尚未串接後端。')}>
              加入白名單
            </button>
            <button className="btn" onClick={() => window.alert('標記可疑動作尚未串接後端。')}>
              標記可疑
            </button>
            <button className="btn btn-danger" onClick={() => window.alert('封鎖需要多訊號＋人工複核流程。')}>
              加入黑名單／封鎖
            </button>
            <button className="btn" onClick={() => window.alert('匯出報告（JSON/PDF）尚未串接。')}>
              匯出報告
            </button>
          </div>
        </section>
      )}

      {show('risk.conflicts') && (
        <section className="decision-card">
          <h2>② 異常與一致性矩陣</h2>
          <div className="decision-table-wrap">
            <table className="decision-table">
              <thead>
                <tr>
                  <th>審計維度</th>
                  <th>宣稱</th>
                  <th>事實／底層</th>
                  <th>判定</th>
                  <th>等級</th>
                </tr>
              </thead>
              <tbody>
                {CONFLICTS.map((row) => (
                  <tr key={row.dimension}>
                    <td>{row.dimension}</td>
                    <td>{row.claimed}</td>
                    <td>{row.reality}</td>
                    <td>{row.verdict}</td>
                    <td>{row.level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {show('network.geo') && (
        <section className="decision-card">
          <h2>③ 網路、IP 與地理</h2>
          <dl className="kv">
            {NETWORK.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {show('hardware.fp') && (
        <section className="decision-card">
          <h2>④ 硬體與設備指紋</h2>
          <dl className="kv">
            {HARDWARE.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {show('browser.env') && (
        <section className="decision-card">
          <h2>⑤ 瀏覽器與軟體環境</h2>
          <dl className="kv">
            {BROWSER.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {show('raw.payload') && (
        <section className="decision-card">
          <h2>⑥ 原始資料與稽核抽屜</h2>
          <p className="muted">
            Raw payload 預設收合；存取需高權限且會被記錄（示範頁未串接）。
          </p>
          <button className="btn" onClick={() => setRawOpen((open) => !open)}>
            {rawOpen ? '收合 Raw JSON' : '展開 Raw JSON'}
          </button>
          {rawOpen && (
            <pre className="decision-raw">{JSON.stringify(DEMO, null, 2)}</pre>
          )}
        </section>
      )}

      {show('governance.audit') && (
        <section className="decision-card">
          <h2>⑦ 治理抽屜（RBAC/審計/保留）</h2>
          <p className="muted">
            Restricted 模組：需資安主管權限，示範資料不顯示實際存取紀錄。
          </p>
        </section>
      )}

      {!moduleIds.has('decision.verdict') && (
        <p className="muted">目前設定把主要決策模組關閉或隱藏，請到管理者工作台調整。</p>
      )}
    </div>
  );
}
