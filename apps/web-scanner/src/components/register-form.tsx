'use client';

import { useState } from 'react';
import { apiBaseUrl } from '../lib/api';

export default function RegisterForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState('developer');
  const [status, setStatus] = useState('');
  const [issuedKey, setIssuedKey] = useState('');

  const submit = async () => {
    if (!name.trim() || !email.trim()) {
      setStatus('請填寫名稱與 Email。');
      return;
    }
    try {
      const response = await fetch(`${apiBaseUrl()}/v1/tenants`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), plan }),
      });
      if (!response.ok) throw new Error(`註冊失敗：${response.status}`);
      const body = (await response.json()) as { apiKey?: string; tenant?: { tenantId?: string } };
      if (!body.apiKey) throw new Error('未取得 API Key');
      window.localStorage.setItem('shieldscan.admin.apiKey', body.apiKey);
      setIssuedKey(body.apiKey);
      setStatus('註冊成功！API Key 已儲存，可前往企業 Dashboard。');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <main className="register-main">
      <h1>ShieldScan API 自助註冊</h1>
      <p className="subtitle">建立租戶並取得正式 API Key（明文僅顯示一次）。</p>
      <div className="card register-card">
        <label className="register-label">
          名稱
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="register-label">
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
        </label>
        <label className="register-label">
          方案
          <select value={plan} onChange={(event) => setPlan(event.target.value)}>
            <option value="free">Free</option>
            <option value="developer">Developer</option>
            <option value="business">Business</option>
          </select>
        </label>
        <button className="btn btn-primary" onClick={submit}>
          註冊並取得 API Key
        </button>
        {status && <p className="decision-status">{status}</p>}
        {issuedKey && (
          <div className="register-key">
            <b>你的 API Key</b>
            <code>{issuedKey}</code>
            <button
              className="btn"
              onClick={() => {
                void navigator.clipboard.writeText(issuedKey);
                setStatus('已複製 API Key');
              }}
            >
              複製
            </button>
            <a className="btn" href="/admin/reports">
              前往企業 Dashboard
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
