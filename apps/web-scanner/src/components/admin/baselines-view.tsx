'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiBaseUrl } from '../../lib/api';

/**
 * 基準分布視覺頁（數位黃金 Step2 展示）。
 * 資料源：GET /v1/baselines（公開聚合、無個人資料）。
 */
interface BaselineRow {
  ruleId: string;
  dim: 'country' | 'asn' | 'tz';
  dimValue: string;
  total: number;
  hits: number;
  hitRate: number;
  updatedAt?: string;
}

const DIM_LABEL: Record<BaselineRow['dim'], string> = {
  country: '國家 / 地區',
  asn: 'ASN / 網路服務商',
  tz: '時區 (UTC)',
};

const RULE_ZH: Record<string, string> = {
  canvas_tamper: 'Canvas 指紋篡改',
  canvas_tampered: 'Canvas 指紋篡改',
  os_mismatch: '作業系統不一致',
  dns_leak: 'DNS 洩漏',
  webrtc_leak: 'WebRTC IP 洩漏',
  open_ports_ssh_rdp: '異常端口開放',
  bot_detected: '機器人特徵',
  server_datacenter_ip: '資料中心 IP',
  server_tor_ip: 'Tor 出口',
  server_vpn_detected: 'VPN 連線',
  server_proxy_detected: 'Proxy 連線',
  server_ip_velocity: 'IP 速度異常',
  server_header_incoherence: '請求標頭異常',
};

function zh(ruleId: string): string {
  return RULE_ZH[ruleId] ?? ruleId;
}

function barColor(rate: number): string {
  if (rate >= 0.8) return '#dc2626';
  if (rate >= 0.4) return '#d97706';
  return '#2563eb';
}

export default function BaselinesView() {
  const [rows, setRows] = useState<BaselineRow[] | null>(null);
  const [error, setError] = useState<string>();
  const [dim, setDim] = useState<'all' | BaselineRow['dim']>('all');
  const [rule, setRule] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch(`${apiBaseUrl()}/v1/baselines?limit=1000`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`伺服器回應 ${res.status}`);
      const body = (await res.json()) as { rows: BaselineRow[] };
      setRows(body.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rules = useMemo(() => {
    const set = new Set((rows ?? []).map((r) => r.ruleId));
    return [...set];
  }, [rows]);

  const visible = useMemo(() => {
    return (rows ?? []).filter(
      (r) => (dim === 'all' || r.dim === dim) && (rule === 'all' || r.ruleId === rule),
    );
  }, [rows, dim, rule]);

  const stats = useMemo(() => {
    const factsTotal = new Map<string, number>();
    for (const r of rows ?? []) {
      const k = `${r.dim}|${r.dimValue}`;
      factsTotal.set(k, Math.max(factsTotal.get(k) ?? 0, r.total));
    }
    const sum = [...factsTotal.values()].reduce((a, b) => a + b, 0);
    return { dimCount: factsTotal.size, facts: sum, rows: rows?.length ?? 0 };
  }, [rows]);

  return (
    <div className="bl-wrap">
      <header className="bl-head">
        <h1>🧮 基準分布（規則 × 國家 / ASN / 時區）</h1>
        <p className="bl-sub">
          每個「規則在某維度值」的 total / hits / hit_rate——讓分數從「猜」變成「有分布可比」。
          資料為匿名聚合（無個人資料）。
        </p>
        <div className="bl-toolbar">
          <button type="button" className="bl-chip" onClick={() => void load()} disabled={loading}>
            {loading ? '載入中…' : '↻ 重新整理'}
          </button>
          {(['all', 'country', 'asn', 'tz'] as const).map((d) => (
            <button
              type="button"
              key={d}
              className={`bl-chip${dim === d ? ' active' : ''}`}
              onClick={() => setDim(d)}
            >
              {d === 'all' ? '全部維度' : DIM_LABEL[d]}
            </button>
          ))}
          <select
            className="bl-select"
            value={rule}
            onChange={(e) => setRule(e.target.value)}
            aria-label="篩選規則"
          >
            <option value="all">全部規則</option>
            {rules.map((r) => (
              <option key={r} value={r}>
                {zh(r)}（{r}）
              </option>
            ))}
          </select>
        </div>
        <div className="bl-stats">
          <span>
            事實（掃描）樣本：<b>{stats.facts}</b>
          </span>
          <span>
            維度-值組合：<b>{stats.dimCount}</b>
          </span>
          <span>
            基準列：<b>{stats.rows}</b>
          </span>
          <span className="bl-hint">hit_rate 越高＝該組合越常命中此規則</span>
        </div>
      </header>

      {error && <p className="bl-empty">載入失敗：{error}</p>}
      {!error && !loading && visible.length === 0 && (
        <p className="bl-empty">
          尚無基準資料。請先在首頁完成掃描，聚合後（自動每 10 分鐘）這裡就會出現分布。
        </p>
      )}

      <div className="bl-list">
        {visible.map((r) => {
          const pct = Math.round(r.hitRate * 100);
          return (
            <div className="bl-row" key={`${r.ruleId}|${r.dim}|${r.dimValue}`}>
              <div className="bl-row-main">
                <div className="bl-rule">
                  <b>{zh(r.ruleId)}</b>
                  <span className="bl-dim">{DIM_LABEL[r.dim]}</span>
                </div>
                <div className="bl-value" title={r.dimValue}>
                  {r.dimValue}
                </div>
                <div className="bl-meta">
                  <span>
                    {r.hits}/{r.total}
                  </span>
                  <b style={{ color: barColor(r.hitRate) }}>{pct}%</b>
                </div>
              </div>
              <div className="bl-bar">
                <div
                  className="bl-bar-fill"
                  style={{ width: `${Math.max(pct, 1)}%`, background: barColor(r.hitRate) }}
                />
              </div>
            </div>
          );
        })}
      </div>


    </div>
  );
}
