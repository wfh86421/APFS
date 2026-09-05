'use client';

import { useState } from 'react';
import { apiBaseUrl } from '../../lib/api';

interface ListReport {
  reportId: string;
  sessionId: string;
  createdAt: string;
  privacyScore?: number;
  riskLevel?: string;
  clientIp?: string;
  tenantId?: string;
}

export default function AdminReportsList() {
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem('shieldscan.admin.apiKey') ?? '';
  });
  const [reports, setReports] = useState<ListReport[]>([]);
  const [role, setRole] = useState('security_admin');
  const [status, setStatus] = useState('');

  const load = async () => {
    if (!apiKey) {
      setStatus('請先填入管理 API Key。');
      return;
    }
    window.localStorage.setItem('shieldscan.admin.apiKey', apiKey);
    try {
      const response = await fetch(`${apiBaseUrl()}/v1/reports?limit=50`, {
        headers: {
          authorization: `Bearer ${apiKey}`,
          'x-role': role,
        },
      });
      if (!response.ok) throw new Error(`API 回應 ${response.status}`);
      const body = (await response.json()) as { reports?: ListReport[] };
      setReports(body.reports ?? []);
      setStatus(`已載入 ${body.reports?.length ?? 0} 筆報告`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="decision-page">
      <h1>企業 Dashboard — 租戶報告列表</h1>
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
          角色預覽（需 security_admin key）
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="security_admin">資安主管</option>
            <option value="risk_analyst">風控分析師</option>
            <option value="customer_support">客服</option>
          </select>
        </label>
        <button className="btn" onClick={load}>
          載入報告
        </button>
      </div>
      {status && <p className="decision-status">{status}</p>}
      <div className="decision-card">
        <div className="decision-table-wrap">
          <table className="decision-table">
            <thead>
              <tr>
                <th>Report ID</th>
                <th>Session</th>
                <th>Client IP</th>
                <th>Privacy Score</th>
                <th>Risk Level</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.reportId}>
                  <td>{report.reportId}</td>
                  <td>{report.sessionId}</td>
                  <td>{report.clientIp ?? '-'}</td>
                  <td>{report.privacyScore ?? '-'}</td>
                  <td>{report.riskLevel ?? '-'}</td>
                  <td>{new Date(report.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {reports.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    尚無報告
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
