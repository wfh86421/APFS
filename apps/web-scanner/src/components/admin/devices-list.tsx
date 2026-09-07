'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiBaseUrl } from '../../lib/api';

interface DeviceItem {
  fingerprintHash: string;
  canvasHash?: string;
  webglHash?: string;
  audioHash?: string;
  unmaskedVendor?: string;
  unmaskedRenderer?: string;
  firstSeen?: string;
  lastSeen?: string;
  sessionCount: number;
  ipCount: number;
  stabilityScore?: number;
  entropyScore?: number;
}

export default function AdminDevicesList() {
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem('shieldscan.admin.apiKey') ?? '';
  });
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [status, setStatus] = useState('');

  const load = async () => {
    if (!apiKey) {
      setStatus('請先填入管理 API Key。');
      return;
    }
    window.localStorage.setItem('shieldscan.admin.apiKey', apiKey);
    try {
      const response = await fetch(`${apiBaseUrl()}/v1/devices?limit=100`, {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) throw new Error(`API 回應 ${response.status}`);
      const body = (await response.json()) as { devices?: DeviceItem[] };
      setDevices(body.devices ?? []);
      setStatus(`已載入 ${body.devices?.length ?? 0} 筆設備指紋`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="decision-page">
      <h1>企業 Dashboard — 設備指紋聚類</h1>
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
        <button className="btn" onClick={load}>
          載入設備
        </button>
      </div>
      {status && <p className="decision-status">{status}</p>}
      <div className="decision-card">
        <div className="decision-table-wrap">
          <table className="decision-table">
            <thead>
              <tr>
                <th>Fingerprint</th>
                <th>Canvas</th>
                <th>WebGL</th>
                <th>GPU</th>
                <th>Sessions</th>
                <th>IPs</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.fingerprintHash}>
                  <td>
                    <Link href={`/admin/devices/${encodeURIComponent(device.fingerprintHash)}`}>
                      {device.fingerprintHash}
                    </Link>
                  </td>
                  <td>{device.canvasHash ?? '-'}</td>
                  <td>{device.webglHash ?? '-'}</td>
                  <td>
                    {device.unmaskedVendor ?? '-'}
                    {device.unmaskedRenderer ? ` / ${device.unmaskedRenderer}` : ''}
                  </td>
                  <td>{device.sessionCount}</td>
                  <td>{device.ipCount}</td>
                  <td>{device.lastSeen ? new Date(device.lastSeen).toLocaleString() : '-'}</td>
                </tr>
              ))}
              {devices.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    尚無設備資料
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
