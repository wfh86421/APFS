'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiBaseUrl } from '../../lib/api';

interface DeviceStats {
  sessionCount: number;
  ipCount: number;
  stabilityScore?: number;
  entropyScore?: number;
  canvasHash?: string;
  lastSeen?: string;
}

interface SessionRow {
  sessionId: string;
  visitorId: string;
  clientIp?: string;
  createdAt: string;
}

interface RelationsResponse {
  device: { fingerprintHash: string; stats: DeviceStats | null };
  windowDays: number;
  totals: { sessions: number; distinctIps: number; distinctAccounts: number };
  sessions: SessionRow[];
  ipUsage: Array<{ ip: string; count: number }>;
  accounts: Array<{ visitorId: string; count: number }>;
  peersByIp: Array<{
    ip: string;
    fingerprints: Array<{ fingerprintHash: string; sessionCount: number; lastSeen: string }>;
  }>;
}

const DAYS = [7, 30, 90];

function apiKeyOf() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('shieldscan.admin.apiKey') ?? '';
}

export default function DeviceRelations({ fingerprintHash }: { fingerprintHash: string }) {
  const [apiKey, setApiKey] = useState(apiKeyOf);
  const [days, setDays] = useState(30);
  const [relations, setRelations] = useState<RelationsResponse | null>(null);
  const [status, setStatus] = useState('');
  // by-ip 搜尋
  const [ipQuery, setIpQuery] = useState('');
  const [byIp, setByIp] = useState<
    Array<{ fingerprintHash: string; sessionCount: number; lastSeen: string }> | null
  >(null);

  const load = async (windowDays = days) => {
    if (!apiKey) {
      setStatus('請先填入管理 API Key。');
      return;
    }
    window.localStorage.setItem('shieldscan.admin.apiKey', apiKey);
    try {
      const response = await fetch(
        `${apiBaseUrl()}/v1/devices/${encodeURIComponent(fingerprintHash)}/relations?days=${windowDays}`,
        { headers: { authorization: `Bearer ${apiKey}` } },
      );
      if (!response.ok) throw new Error(`API 回應 ${response.status}`);
      const body = (await response.json()) as RelationsResponse;
      setRelations(body);
      setStatus(
        `裝置 ${fingerprintHash}：${body.totals.sessions} sessions / ${body.totals.distinctIps} IP / ${body.totals.distinctAccounts} 帳號（近 ${body.windowDays} 天）`,
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const searchByIp = async () => {
    if (!apiKey || !ipQuery.trim()) {
      setStatus(apiKey ? '請輸入 IP。' : '請先填入管理 API Key。');
      return;
    }
    try {
      const response = await fetch(
        `${apiBaseUrl()}/v1/devices/by-ip?ip=${encodeURIComponent(ipQuery.trim())}&days=${days}`,
        { headers: { authorization: `Bearer ${apiKey}` } },
      );
      if (!response.ok) throw new Error(`API 回應 ${response.status}`);
      const body = (await response.json()) as {
        ip: string;
        fingerprints: Array<{ fingerprintHash: string; sessionCount: number; lastSeen: string }>;
      };
      setByIp(body.fingerprints);
      setStatus(`IP ${body.ip}：${body.fingerprints.length} 個裝置`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="decision-page">
      <h1>企業 Dashboard — 設備關聯圖譜</h1>
      <p className="subtitle">
        裝置 ↔ session ↔ IP ↔ 帳號 關聯（租戶內）。點 IP 旁的裝置可繼續追蹤。
      </p>

      <div className="decision-config">
        <label>
          管理 API Key
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="shd_live_..."
          />
        </label>
        <label>
          時窗（天）
          <select
            value={days}
            onChange={(event) => {
              const next = Number(event.target.value);
              setDays(next);
              if (relations) void load(next);
            }}
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d} 天
              </option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={() => void load()}>
          載入關聯
        </button>
      </div>

      <div className="decision-config">
        <label>
          IP 反向查詢
          <input
            value={ipQuery}
            onChange={(event) => setIpQuery(event.target.value)}
            placeholder="例如 49.214.1.196"
          />
        </label>
        <button className="btn" onClick={() => void searchByIp()}>
          查此 IP 的裝置
        </button>
      </div>
      {status && <p className="decision-status">{status}</p>}

      {byIp && byIp.length > 0 && (
        <section className="decision-card">
          <h3>此 IP 使用過的裝置</h3>
          <ul>
            {byIp.map((row) => (
              <li key={row.fingerprintHash}>
                <Link href={`/admin/devices/${encodeURIComponent(row.fingerprintHash)}`}>
                  {row.fingerprintHash}
                </Link>{' '}
                · {row.sessionCount} sessions · {new Date(row.lastSeen).toLocaleString()}
              </li>
            ))}
          </ul>
        </section>
      )}

      {relations && (
        <>
          <section
            className="decision-card decision-hero"
            style={{ marginTop: 8 }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 12,
                width: '100%',
              }}
            >
              <div>
                <b className="decision-score">{relations.totals.sessions}</b>
                <div>Sessions</div>
              </div>
              <div>
                <b className="decision-score">{relations.totals.distinctIps}</b>
                <div>不同 IP</div>
              </div>
              <div>
                <b className="decision-score">{relations.totals.distinctAccounts}</b>
                <div>不同帳號</div>
                <small className="muted">多帳號＝共享/農場疑慮</small>
              </div>
              <div>
                <b className="decision-score">{relations.device.stats?.sessionCount ?? '-'}</b>
                <div>Device 總 sessions</div>
              </div>
              <div>
                <b className="decision-score">{relations.device.stats?.ipCount ?? '-'}</b>
                <div>Device 總 IPs</div>
              </div>
            </div>
          </section>

          <section className="decision-card">
            <h3>Sessions（近 {relations.windowDays} 天）</h3>
            <div className="decision-table-wrap">
              <table className="decision-table">
                <thead>
                  <tr>
                    <th>時間</th>
                    <th>IP</th>
                    <th>帳號（visitor）</th>
                    <th>Session</th>
                  </tr>
                </thead>
                <tbody>
                  {relations.sessions.map((session) => (
                    <tr key={session.sessionId}>
                      <td>{new Date(session.createdAt).toLocaleString()}</td>
                      <td>{session.clientIp ?? '-'}</td>
                      <td>{session.visitorId}</td>
                      <td>{session.sessionId}</td>
                    </tr>
                  ))}
                  {relations.sessions.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                        時窗內無 session
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="decision-card">
            <h3>帳號使用</h3>
            <ul>
              {relations.accounts.map((account) => (
                <li key={account.visitorId}>
                  {account.visitorId} · {account.count} sessions
                </li>
              ))}
              {relations.accounts.length === 0 && <li className="muted">無</li>}
            </ul>
          </section>

          <section className="decision-card">
            <h3>IP 使用分佈</h3>
            <ul>
              {relations.ipUsage.map((item) => (
                <li key={item.ip}>
                  {item.ip} · {item.count} sessions
                </li>
              ))}
              {relations.ipUsage.length === 0 && <li className="muted">無</li>}
            </ul>
          </section>

          <section className="decision-card">
            <h3>共用 IP 的其他裝置（圖譜邊）</h3>
            {relations.peersByIp.map((peer) => (
              <div key={peer.ip}>
                <b>IP {peer.ip}</b>
                <ul>
                  {peer.fingerprints.map((row) => (
                    <li key={row.fingerprintHash}>
                      <Link href={`/admin/devices/${encodeURIComponent(row.fingerprintHash)}`}>
                        {row.fingerprintHash}
                      </Link>{' '}
                      · {row.sessionCount} sessions · {new Date(row.lastSeen).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {relations.peersByIp.length === 0 && <p className="muted">無共用 IP 的其他裝置</p>}
          </section>
        </>
      )}
    </div>
  );
}
