'use client';

/**
 * 新版首頁「掃描結果總覽」體驗（BrowserScan 風格）。
 *
 * 由 page.tsx 在 build-time 旗標 process.env.NEXT_PUBLIC_EXPERIENCE === 'overview'
 * 時取代 classic 首頁。行為：
 *   1. mount 完成即自動掃描一次（同意模式固定為 standard，會上傳伺服器取得
 *      IP／地理位置／ISP／WebRTC 比對與伺服器評分），僅觸發一次。
 *   2. 掃描後顯示「重新掃描」按鈕；再次掃描需點擊。
 *   3. 報告呈現為總覽：快速摘要 hero + 響應式 2~4 欄資訊卡片網格。
 *   4. 伺服器上傳失敗 → 降級警告；IP／地理等伺服器欄位顯示 —，
 *      但 signals 中 WebRTC 訊號的公網 IP 仍可顯示。
 *
 * 資料來源：
 *   - report.signals   ：10 個 browser-sdk 模組訊號（key/value/hash）
 *   - report.issues    ：本機一致性異常（lib/analyze analyzeSignals）
 *   - score            ：ScoringEngine 結果（伺服器成功時採用伺服器 score）
 *   - network          ：submitReport 回傳的伺服器網路分析（geo/webrtc/dnsLeak…）
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  audioModule,
  canvasModule,
  clientHintsModule,
  localeModule,
  screenModule,
  ShieldScanSDK,
  timezoneModule,
  uaModule,
  webglModule,
  webgpuModule,
  webrtcModule,
  type ScanProgressEvent,
} from '@shieldscan/browser-sdk';
import {
  policyDecisionForRiskLevel,
  type EnvironmentReport,
  type NormalizedSignal,
  type PolicyDecision,
} from '@shieldscan/core-schema';
import type { ScoreResult } from '@shieldscan/scoring-engine';
import { analyzeSignals } from '../lib/analyze';
import { submitReport, type ServerNetworkAnalysis } from '../lib/api';

/* ------------------------------------------------------------------ */
/* 常數／小工具                                                          */
/* ------------------------------------------------------------------ */

const DASH = '—';

const MODULES = [
  uaModule,
  clientHintsModule,
  canvasModule,
  webglModule,
  webgpuModule,
  audioModule,
  screenModule,
  localeModule,
  timezoneModule,
  webrtcModule,
];

const STATUS_LABEL: Record<ScanProgressEvent['status'], string> = {
  running: '採集中…',
  completed: '完成',
  failed: '失敗',
};

/** 嚴格模式下 effect 會跑兩次：以 module 層級旗標保證「僅自動掃描一次」。 */
let autoScanStarted = false;

interface NavSnapshot {
  cores: number | null;
  memoryGb: number | null;
  connectionType: string | null;
}

interface OvData {
  report: EnvironmentReport;
  score: ScoreResult;
  policy?: PolicyDecision;
  network?: ServerNetworkAnalysis;
  analysisSource: 'local' | 'server';
  elapsedMs: number;
  warning?: string;
  pageUrl: string;
  nav: NavSnapshot;
  scannedAt: string;
}

function readNavSnapshot(): NavSnapshot {
  if (typeof window === 'undefined') {
    return { cores: null, memoryGb: null, connectionType: null };
  }
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string; type?: string };
  };
  const memory = typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 ? nav.deviceMemory : null;
  const effectiveType = nav.connection?.effectiveType;
  const connectionType =
    typeof effectiveType === 'string' && effectiveType.length > 0 ? effectiveType : nav.connection?.type ?? null;
  return {
    cores: Number.isFinite(navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : null,
    memoryGb: memory,
    connectionType,
  };
}

function signalOf(signals: NormalizedSignal[], key: string): NormalizedSignal | undefined {
  return signals.find((s) => s.key === key);
}

function valueOf(
  signals: NormalizedSignal[],
  key: string,
): Record<string, unknown> | null {
  const s = signalOf(signals, key);
  if (!s || typeof s.value !== 'object' || s.value === null) return null;
  return s.value as Record<string, unknown>;
}

function asStr(rec: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const v = rec?.[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function asNum(rec: Record<string, unknown> | null | undefined, key: string): number | undefined {
  const v = rec?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function yesNo(v: unknown): string {
  return typeof v === 'boolean' ? (v ? '是' : '否') : DASH;
}

function hashHead(h: unknown): string {
  return typeof h === 'string' && h.length > 0 ? `${h.slice(0, 16)}…` : DASH;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function isPublicIpv4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
  if (a > 255 || b > 255) return false;
  if (a === 10 || a === 127) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  return true;
}

/**
 * WebRTC 公網 IP：
 * 1) 伺服器 network.webrtc.publicIp（standard 上傳成功後）；
 * 2) 降級時退回 signals.webrtc：先看訊號自帶 publicIp，再從 localIps
 *    （STUN 候選端點）挑出第一個公網 IPv4。
 */
function webrtcPublicIp(signals: NormalizedSignal[], network?: ServerNetworkAnalysis): string {
  if (network?.webrtc?.publicIp) return network.webrtc.publicIp;
  const w = valueOf(signals, 'webrtc');
  const own = w?.publicIp;
  if (typeof own === 'string' && own.length > 0) return own;
  const raw = w?.localIps;
  const localIps = Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string')
    : [];
  return localIps.find(isPublicIpv4) ?? DASH;
}

function webrtcLocalIps(signals: NormalizedSignal[]): string[] {
  const w = valueOf(signals, 'webrtc');
  const raw = w?.localIps;
  return Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string')
    : [];
}

function parseBrowser(uaText: string): string {
  if (!uaText) return DASH;
  const grab = (pattern: RegExp): string | undefined => {
    const hit = uaText.match(pattern)?.[1];
    return typeof hit === 'string' ? hit.split('.')[0] ?? hit : undefined;
  };
  if (/EdgA?\//i.test(uaText)) return `Edge ${grab(/EdgA?\/([\d.]+)/i) ?? ''}`.trim();
  if (/OPR\//.test(uaText)) return `Opera ${grab(/OPR\/([\d.]+)/) ?? ''}`.trim();
  if (/Firefox\//i.test(uaText)) return `Firefox ${grab(/Firefox\/([\d.]+)/i) ?? ''}`.trim();
  if (/Chrome\//i.test(uaText) && !/CriOS\//i.test(uaText)) {
    return `Chrome ${grab(/Chrome\/([\d.]+)/) ?? ''}`.trim();
  }
  if (/Version\//i.test(uaText) && /Safari\//i.test(uaText)) {
    return `Safari ${grab(/Version\/([\d.]+)/i) ?? ''}`.trim();
  }
  if (/CriOS\//i.test(uaText)) return `Chrome iOS ${grab(/CriOS\/([\d.]+)/) ?? ''}`.trim();
  const first = uaText.split(' ')[0];
  return typeof first === 'string' && first.length > 0 ? first : DASH;
}

function osName(signals: NormalizedSignal[]): string {
  const ch = valueOf(signals, 'clientHints');
  const chPlatform = asStr(ch, 'platform');
  if (chPlatform) return chPlatform;
  const ua = valueOf(signals, 'ua');
  const uaText = asStr(ua, 'userAgent') ?? '';
  if (/Windows/i.test(uaText)) return 'Windows';
  if (/Android/i.test(uaText)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(uaText)) return 'iOS';
  if (/Mac OS X|Macintosh/i.test(uaText)) return 'macOS';
  if (/Linux/i.test(uaText)) return 'Linux';
  return DASH;
}

/** 伺服器成功回傳時，network 上的 geo 實際由 network-intel GeoIpInfo 提供（含座標）。 */
type RichGeo = NonNullable<ServerNetworkAnalysis['geo']> & {
  countryCode?: string;
  latitude?: number;
  longitude?: number;
};

function geoOf(network?: ServerNetworkAnalysis): RichGeo | null {
  const g = network?.geo;
  return g ? (g as RichGeo) : null;
}

const RISK_ZH: Record<string, string> = {
  low: '低風險',
  medium: '中風險',
  high: '高風險',
  critical: '極高風險',
};

const POLICY_ZH: Record<string, string> = {
  allow: '放行',
  review: '人工複核',
  challenge: '主動挑戰',
  block: '封鎖',
  limit: '限制',
  log_only: '僅記錄',
};

const TRACK_ZH: Record<string, string> = {
  privacy: '隱私軌',
  fraud: '欺詐軌',
};

function zhOr(record: Record<string, string>, value: string | undefined, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? record[value] ?? value : fallback;
}

type Tone = 'good' | 'warn' | 'bad';

function sevTone(severity: string): Tone {
  if (severity === 'critical' || severity === 'high' || severity === 'bad') return 'bad';
  if (severity === 'medium' || severity === 'warning' || severity === 'warn') return 'warn';
  return 'good';
}

function numTone(score: number): Tone {
  if (score >= 70) return 'good';
  if (score >= 50) return 'warn';
  return 'bad';
}

/* ------------------------------------------------------------------ */
/* 摘要列與資料彙整                                                       */
/* ------------------------------------------------------------------ */

interface SummaryRow {
  label: string;
  value: string;
}

function buildSummaryRows(data: OvData): SummaryRow[] {
  const signals = data.report.signals;
  const network = data.network;
  const geo = geoOf(network);
  const serverOk = Boolean(network);

  const ua = valueOf(signals, 'ua');
  const uaText = asStr(ua, 'userAgent') ?? '';
  const locale = valueOf(signals, 'locale');
  const tz = valueOf(signals, 'timezone');

  const geoPlace = [asStr(geo, 'country'), asStr(geo, 'city')].filter(Boolean).join(' / ');
  const publicIp = webrtcPublicIp(signals, network);
  const ipValue = serverOk && network?.ip ? network.ip : publicIp;

  const hitWords: string[] = [
    ...(data.score.explanations ?? []).map((e) => e.ruleId.toLowerCase()),
    ...data.report.issues.map((i) => i.type.toLowerCase()),
  ];
  const anonParts: string[] = [];
  if (network?.vpn) anonParts.push('VPN');
  if (network?.tor) anonParts.push('Tor');
  if (network?.datacenter) anonParts.push('資料中心');

  return [
    { label: '頁面', value: data.pageUrl || DASH },
    { label: 'IP', value: ipValue },
    { label: '瀏覽器', value: parseBrowser(uaText) },
    { label: '平台 / 作業系統', value: osName(signals) },
    { label: 'IP 時區', value: asStr(geo, 'timezone') ?? DASH },
    { label: '地理位置', value: geoPlace || DASH },
    { label: '語言', value: asStr(locale, 'language') ?? asStr(ua, 'language') ?? DASH },
    { label: 'ISP', value: asStr(geo, 'isp') ?? DASH },
    { label: '代理伺服器', value: serverOk ? yesNo(network?.proxy) : DASH },
    {
      label: '匿名服務',
      value: serverOk ? (anonParts.length > 0 ? `是（${anonParts.join('、')}）` : '否') : DASH,
    },
    {
      label: '黑名單',
      value: serverOk
        ? hitWords.some((w) => w.includes('blacklist') || w.includes('reputation'))
          ? '是'
          : '否'
        : DASH,
    },
    {
      label: 'DNS Leak',
      value: network?.dnsLeak ? yesNo(network.dnsLeak.detected) : DASH,
    },
    {
      label: '機器人偵測',
      value: serverOk ? (hitWords.some((w) => w.includes('bot')) ? '是' : '否') : DASH,
    },
    { label: '時區（瀏覽器）', value: asStr(tz, 'timezone') ?? DASH },
  ];
}

/* ------------------------------------------------------------------ */
/* 畫面小元件                                                            */
/* ------------------------------------------------------------------ */

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="ov-field">
      <span className="ov-field-label">{label}</span>
      <span className="ov-field-value">{value}</span>
    </div>
  );
}

function Card({
  icon,
  title,
  className = '',
  children,
}: {
  icon: string;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`ov-card ${className}`}>
      <div className="ov-card-head">
        <span className="ov-card-icon" aria-hidden="true">
          {icon}
        </span>
        <h3 className="ov-card-title">{title}</h3>
      </div>
      <div className="ov-card-body">{children}</div>
    </section>
  );
}

function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`ov-badge ov-badge-${tone}`}>{children}</span>;
}

function DimBar({
  label,
  value,
  inverse = false,
}: {
  label: string;
  value: number;
  inverse?: boolean;
}) {
  const tone: Tone = inverse
    ? value <= 30
      ? 'good'
      : value >= 60
        ? 'bad'
        : 'warn'
    : numTone(value);
  return (
    <div className="ov-dim">
      <div className="ov-dim-head">
        <span>{label}</span>
        <span className="ov-dim-value">{Math.round(value)}</span>
      </div>
      <div className="ov-bar">
        <div className={`ov-bar-fill ov-bar-${tone}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
}

function ProgressBlock({ title, progress }: { title: string; progress: ScanProgressEvent[] }) {
  const completed = progress.filter((p) => p.status === 'completed').length;
  const percent = progress.length === 0 ? 0 : Math.round((completed / MODULES.length) * 100);
  return (
    <section className="ov-card ov-scan-progress">
      <div className="ov-card-head">
        <span className="ov-card-icon" aria-hidden="true">
          {title.includes('重新') ? '🔄' : '🔍'}
        </span>
        <h3 className="ov-card-title">{title}</h3>
        <span className="ov-chip">
          {completed}/{MODULES.length} ・ {percent}%
        </span>
      </div>
      <div className="ov-progress">
        {progress.length === 0 && <p className="ov-empty">正在初始化採集模組…</p>}
        {[...progress]
          .sort((a, b) => a.index - b.index)
          .map((p) => (
            <div className={`ov-progress-row ov-progress-${p.status}`} key={p.moduleId}>
              <span className="ov-progress-icon" aria-hidden="true">
                {p.status === 'completed' ? '✅' : p.status === 'failed' ? '❌' : '⏳'}
              </span>
              <span className="ov-progress-name">{p.moduleName}</span>
              <span className="ov-progress-status">{STATUS_LABEL[p.status]}</span>
              {p.status === 'completed' && <span className="ov-progress-ms">{Math.round(p.durationMs)} ms</span>}
            </div>
          ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 主元件                                                               */
/* ------------------------------------------------------------------ */

export default function HomeOverviewV2() {
  const [data, setData] = useState<OvData | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ScanProgressEvent[]>([]);
  const [scanError, setScanError] = useState<string>();
  const [armed, setArmed] = useState(false);
  const dataRef = useRef<OvData | null>(null);

  const runScan = async () => {
    setBusy(true);
    setScanError(undefined);
    setProgress([]);
    const startedAt = performance.now();

    try {
      const sdk = new ShieldScanSDK({ sdkVersion: '0.1.0' });
      for (const module of MODULES) sdk.register(module);
      const session = await sdk.scan();
      session.onProgress((event) => {
        setProgress((prev) => [...prev.filter((p) => p.moduleId !== event.moduleId), event]);
      });
      const signals = await session.waitForCompletion();
      const elapsedMs = Math.round(performance.now() - startedAt);

      // 同意模式固定 standard：上傳伺服器以取得 IP／地理位置／ISP／伺服器分數。
      const { report, score: localScore } = await analyzeSignals(signals, { mode: 'standard' });

      let score = localScore;
      let network: ServerNetworkAnalysis | undefined;
      let policy: PolicyDecision | undefined;
      let warning: string | undefined;
      let analysisSource: 'local' | 'server' = 'local';

      try {
        const server = await submitReport(report);
        // 沿用 classic 首頁慣例：以伺服器 finalScore 覆寫四維推估值並附帶 network raw。
        report.scores = {
          privacyExposure: server.score.finalScore,
          authenticity: server.score.finalScore,
          automationRisk: 100 - server.score.finalScore,
          networkTrust: server.score.finalScore,
        };
        report.raw = { ...(report.raw as object | undefined), network: server.network };
        score = server.score;
        network = server.network;
        policy = server.policy;
        analysisSource = 'server';
      } catch (err) {
        warning = `伺服器分析失敗（${err instanceof Error ? err.message : String(err)}），已降級為本機預覽：IP／地理位置等伺服器欄位顯示 —（WebRTC 公網 IP 仍可顯示）`;
      }

      const next: OvData = {
        report,
        score,
        policy,
        network,
        analysisSource,
        elapsedMs,
        warning,
        pageUrl: window.location.href,
        nav: readNavSnapshot(),
        scannedAt: new Date().toLocaleString('zh-TW', { hour12: false }),
      };
      dataRef.current = next;
      setData(next);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // mount 完成即自動掃描一次（module 層級旗標確保 StrictMode 下也只跑一次）。
  useEffect(() => {
    if (autoScanStarted) return;
    autoScanStarted = true;
    setArmed(true);
    void runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = data ?? dataRef.current;
  const completed = progress.filter((p) => p.status === 'completed').length;
  const scanPercent = progress.length === 0 ? 0 : Math.round((completed / MODULES.length) * 100);
  const network = current?.network;
  const geo = geoOf(network);
  const signals = current?.report.signals ?? [];

  const actionLabel = busy
    ? `掃描中… ${scanPercent}%`
    : current
      ? '重新掃描'
      : '開始掃描';

  return (
    <div className="ov-experience">
      {/* 頂部工具列 */}
      <header className="ov-top">
        <div className="ov-top-inner">
          <div className="ov-brand">
            <span className="ov-brand-mark" aria-hidden="true">
              🛡️
            </span>
            <span className="ov-brand-text">
              ShieldScan 隱盾檢測
              <span className="ov-brand-tag">掃描總覽</span>
            </span>
          </div>
          <div className="ov-top-actions">
            <span className="ov-chip" title="此體驗固定以 standard 模式自動上傳分析">
              同意模式：standard
            </span>
            {current && (
              <span className={`ov-chip ${current.analysisSource === 'server' ? 'ov-chip-server' : 'ov-chip-local'}`}>
                {current.analysisSource === 'server' ? '伺服器分析' : '本機預覽'}
              </span>
            )}
            <button
              type="button"
              className="ov-btn ov-btn-primary"
              onClick={() => void runScan()}
              disabled={busy || !armed}
            >
              {actionLabel}
            </button>
          </div>
        </div>
      </header>

      <div className="ov-page">
        {/* 頁首說明 */}
        <div className="ov-intro">
          <h1 className="ov-title">🛡️ ShieldScan 掃描總覽</h1>
          <p className="ov-subtitle">
            進入頁面即自動掃描一次（同意模式 standard，會上傳至伺服器分析）。
            下方顯示網站／伺服器能從你的瀏覽器與網路環境看到哪些資訊；之後可點「重新掃描」再次檢測。
          </p>
        </div>

        {/* 降級／錯誤警告 */}
        {current?.warning && (
          <div className="ov-warning" role="alert">
            ⚠️ {current.warning}
          </div>
        )}
        {scanError && !busy && (
          <div className="ov-error" role="alert">
            ❌ 掃描失敗：{scanError}
            {current && '（已保留上次結果）'}
          </div>
        )}

        {/* 掃描中：模組進度列（與 classic ScanPanel 相同的 ✅/❌/⏳ 10 模組） */}
        {busy && progress.length > 0 && (
          <ProgressBlock title={current ? '重新掃描中…' : '自動掃描中…'} progress={progress} />
        )}

        {!current && !scanError && (
          <div className="ov-scanning">
            <section className="ov-card">
              <div className="ov-card-head">
                <span className="ov-card-icon" aria-hidden="true">
                  ⏳
                </span>
                <h3 className="ov-card-title">等待自動掃描…</h3>
              </div>
              <p className="ov-empty">頁面載入完成後將自動執行一次掃描，毋須點擊。</p>
            </section>
          </div>
        )}

        {!current && scanError && !busy && (
          <div className="ov-scanning">
            <section className="ov-card">
              <div className="ov-card-head">
                <span className="ov-card-icon" aria-hidden="true">
                  ❌
                </span>
                <h3 className="ov-card-title">掃描未完成</h3>
              </div>
              <p className="ov-empty">請點右上角「開始掃描」重試。</p>
            </section>
          </div>
        )}

        {/* 結果總覽 */}
        {current && (
          <>
            {/* 快速摘要 hero（深色） */}
            <section className="ov-hero">
              <div className="ov-hero-meta">
                <span className="ov-hero-chip">
                  來源：{current.analysisSource === 'server' ? '伺服器分析' : '本機預覽'}
                </span>
                <span className="ov-hero-chip">耗時 {current.elapsedMs} ms</span>
                <span className="ov-hero-chip">時間 {current.scannedAt}</span>
              </div>
              <h2 className="ov-hero-title">快速摘要：網站從這次連線看到的你</h2>
              <div className="ov-summary">
                {buildSummaryRows(current).map((row) => (
                  <div className="ov-summary-item" key={row.label}>
                    <span className="ov-summary-label">{row.label}</span>
                    <span className="ov-summary-value">{row.value}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* 主區標題 + 資訊卡片網格 */}
            <h2 className="ov-main-title">網站會看到你哪些資訊</h2>

            <div className="ov-grid">
              {/* ── IP 地址卡 ─────────────────────────────── */}
              <Card icon="🌐" title="IP 地址">
                <Field label="IP" value={network?.ip ?? webrtcPublicIp(signals, network)} />
                <Field label="WebRTC 公網 IP" value={webrtcPublicIp(signals, network)} />
                <Field
                  label="WebRTC STUN 端點"
                  value={(() => {
                    const ips = webrtcLocalIps(signals);
                    return ips.length > 0 ? ips.join('、') : DASH;
                  })()}
                />
                <Field
                  label="IP 計數（7 天）"
                  value={
                    (current.score.explanations ?? []).some((e) => e.ruleId === 'server_ip_velocity')
                      ? '異常（多 IP）'
                      : DASH
                  }
                />
                <p className="ov-note">7 天 IP 速度統計需具身分後端才會提供。</p>
              </Card>

              {/* ── 地理位置卡 ─────────────────────────────── */}
              <Card icon="🗺️" title="地理位置">
                <Field label="國家 / 地區" value={asStr(geo, 'country') ?? DASH} />
                <Field label="城市" value={asStr(geo, 'city') ?? DASH} />
                <Field label="區域" value={asStr(geo, 'region') ?? DASH} />
                <Field label="ISP" value={asStr(geo, 'isp') ?? DASH} />
                <Field label="ASN" value={asStr(geo, 'asn') ?? DASH} />
                <Field
                  label="座標"
                  value={(() => {
                    const lat = asNum(geo, 'latitude');
                    const lng = asNum(geo, 'longitude');
                    return lat !== undefined && lng !== undefined
                      ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
                      : DASH;
                  })()}
                />
              </Card>

              {/* ── 硬體卡 ─────────────────────────────────── */}
              <Card icon="🖥️" title="硬體">
                <Field
                  label="CPU 核心數"
                  value={current.nav.cores && current.nav.cores > 0 ? `${current.nav.cores} 核心` : DASH}
                />
                <Field
                  label="記憶體"
                  value={current.nav.memoryGb ? `${current.nav.memoryGb} GB` : DASH}
                />
                <Field
                  label="解析度"
                  value={(() => {
                    const screen = valueOf(signals, 'screen');
                    return asStr(screen, 'resolution') ?? DASH;
                  })()}
                />
                <Field
                  label="色深"
                  value={(() => {
                    const screen = valueOf(signals, 'screen');
                    const depth = asNum(screen, 'colorDepth');
                    return depth !== undefined ? `${depth} bit` : DASH;
                  })()}
                />
                <Field
                  label="GPU"
                  value={(() => {
                    const webgl = valueOf(signals, 'webgl');
                    const renderer = asStr(webgl, 'renderer');
                    return renderer ?? DASH;
                  })()}
                />
              </Card>

              {/* ── 瀏覽器環境卡 ───────────────────────────── */}
              <Card icon="🧬" title="瀏覽器環境">
                <Field
                  label="UA 摘要"
                  value={(() => {
                    const ua = valueOf(signals, 'ua');
                    const raw = asStr(ua, 'userAgent');
                    return raw ? truncate(raw, 110) : DASH;
                  })()}
                />
                <Field
                  label="語言"
                  value={(() => {
                    const locale = valueOf(signals, 'locale');
                    const ua = valueOf(signals, 'ua');
                    return asStr(locale, 'language') ?? asStr(ua, 'language') ?? DASH;
                  })()}
                />
                <Field
                  label="時區"
                  value={(() => {
                    const tz = valueOf(signals, 'timezone');
                    const name = asStr(tz, 'timezone');
                    const offset = asNum(tz, 'offsetHours');
                    if (!name && offset === undefined) return DASH;
                    const offsetPart =
                      offset !== undefined
                        ? `（UTC${offset >= 0 ? '+' : ''}${offset}）`
                        : '';
                    return `${name ?? DASH}${offsetPart}`;
                  })()}
                />
                <Field
                  label="Canvas 指紋"
                  value={hashHead(signalOf(signals, 'canvas')?.hash)}
                />
                <Field
                  label="WebGL 指紋"
                  value={hashHead(signalOf(signals, 'webgl')?.hash)}
                />
                <Field
                  label="WebGPU 指紋"
                  value={hashHead(signalOf(signals, 'webgpu')?.hash)}
                />
                <Field
                  label="Audio 指紋"
                  value={hashHead(signalOf(signals, 'audio')?.hash)}
                />
                <Field label="字型" value={DASH} />
                <Field label="外掛" value={DASH} />
                <p className="ov-note">目前 10 個採集模組未含字型／外掛指紋。</p>
              </Card>

              {/* ── 網路訊號卡 ─────────────────────────────── */}
              <Card icon="📡" title="網路訊號">
                <Field
                  label="WebRTC 一致性"
                  value={
                    network
                      ? network.webrtc.consistency === 'consistent'
                        ? '一致'
                        : network.webrtc.consistency === 'leak'
                          ? '洩漏'
                          : '未知'
                      : DASH
                  }
                />
                <Field
                  label="本機 IP 數"
                  value={network ? `${network.webrtc.localIps.length} 個` : DASH}
                />
                <Field
                  label="DNS Leak"
                  value={network?.dnsLeak ? yesNo(network.dnsLeak.detected) : DASH}
                />
                <Field
                  label="連線類型"
                  value={current.nav.connectionType ?? DASH}
                />
                <div className="ov-flag-row">
                  <span className="ov-flag-label">服務判定</span>
                  <div className="ov-flag-chips">
                    <span className={`ov-flag ${network?.proxy ? 'ov-flag-on' : ''}`}>Proxy</span>
                    <span className={`ov-flag ${network?.vpn ? 'ov-flag-on' : ''}`}>VPN</span>
                    <span className={`ov-flag ${network?.tor ? 'ov-flag-on' : ''}`}>Tor</span>
                    <span className={`ov-flag ${network?.datacenter ? 'ov-flag-on' : ''}`}>資料中心</span>
                  </div>
                </div>
                <Field label="風險等級" value={zhOr(RISK_ZH, network?.riskLevel, DASH)} />
              </Card>

              {/* ── 異常與風險卡 ───────────────────────────── */}
              <Card icon="🚨" title="異常與風險" className="ov-card-wide">
                {(() => {
                  const explanations = current.score.explanations ?? [];
                  const issues = current.report.issues ?? [];
                  if (explanations.length === 0 && issues.length === 0) {
                    return <p className="ov-empty">未發現異常與風險因素。</p>;
                  }
                  return (
                    <>
                      {explanations.length > 0 && (
                        <>
                          <h4 className="ov-subhead">評分因素（score.explanations）</h4>
                          {explanations.map((e) => {
                            const tone = sevTone(e.severity);
                            return (
                              <div className={`ov-risk-row ov-risk-${tone}`} key={e.ruleId}>
                                <div className="ov-risk-line">
                                  <strong>{e.reason}</strong>
                                  <Badge tone={tone}>{e.severity}</Badge>
                                </div>
                                <div className="ov-risk-meta">
                                  規則 {e.ruleId} ・ {zhOr(TRACK_ZH, e.track, e.track)} ・ 扣 {e.points} 分
                                </div>
                              </div>
                            );
                          })}
                        </>
                      )}
                      {issues.length > 0 && (
                        <>
                          <h4 className="ov-subhead">本機一致性異常（report.issues）</h4>
                          {issues.map((issue) => {
                            const tone = sevTone(issue.severity);
                            return (
                              <div className={`ov-risk-row ov-risk-${tone}`} key={issue.id}>
                                <div className="ov-risk-line">
                                  <strong>{issue.type}</strong>
                                  <Badge tone={tone}>{issue.severity}</Badge>
                                </div>
                                <div className="ov-risk-meta">{issue.description}</div>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </>
                  );
                })()}
              </Card>

              {/* ── 評分卡 ─────────────────────────────────── */}
              <Card icon="🏆" title="評分" className="ov-card-wide">
                <div className="ov-score-hero">
                  <div className={`ov-score-num ov-score-${numTone(current.score.finalScore)}`}>
                    {current.score.finalScore}
                  </div>
                  <div className="ov-score-side">
                    <div className="ov-score-badges">
                      <Badge tone="good">Grade {current.score.grade}</Badge>
                      <Badge tone={numTone(current.score.finalScore)}>
                        {zhOr(RISK_ZH, current.score.riskLevel, DASH)}
                      </Badge>
                      <Badge tone={sevTone(current.score.riskLevel)}>
                        {current.policy
                          ? `政策 ${zhOr(POLICY_ZH, current.policy, current.policy)}`
                          : `建議決策 ${zhOr(POLICY_ZH, policyDecisionForRiskLevel(current.score.riskLevel), DASH)}（本機推估）`}
                      </Badge>
                    </div>
                    <div className="ov-score-meta">
                      同意模式 standard ・ 分析來源：
                      {current.analysisSource === 'server' ? '伺服器' : '本機（降級）'} ・ 耗時{' '}
                      {current.elapsedMs} ms
                    </div>
                  </div>
                </div>
                <div className="ov-dims">
                  <DimBar label="隱私暴露（越低越好）" value={current.report.scores.privacyExposure} inverse />
                  <DimBar label="環境真實性" value={current.report.scores.authenticity} />
                  <DimBar label="自動化風險（越低越好）" value={current.report.scores.automationRisk} inverse />
                  <DimBar label="網路信任" value={current.report.scores.networkTrust} />
                </div>
                <div className="ov-score-foot">
                  <span className="ov-foot-chip">隱私軌 {Math.round(current.score.privacyScore)}/100</span>
                  <span className="ov-foot-chip">欺詐軌 {Math.round(current.score.fraudScore)}/100</span>
                  <span className="ov-foot-chip">報告 ID {current.report.reportId.slice(0, 8)}</span>
                  <span className="ov-foot-chip">SDK {current.report.sdk.version}</span>
                </div>
              </Card>
            </div>

            <p className="ov-source-note">
              資料來源：@shieldscan/browser-sdk 10 個採集模組（UA / Client Hints / Canvas / WebGL /
              WebGPU / Audio / 螢幕 / 語言 / 時區 / WebRTC）→ analyzeSignals（standard）→
              submitReport（伺服器 network／score）。伺服器連線失敗時顯示降級警告並退回本機預覽。
            </p>
          </>
        )}

        {/* 頁尾導覽列 */}
        <footer className="ov-footer">
          ShieldScan 掃描總覽體驗（NEXT_PUBLIC_EXPERIENCE=overview） — 正式站首頁與 E2E 不受影響。
          <span className="ov-footer-links">
            <a href="/register">API 自助註冊</a>・
            <a href="/pricing">定價</a>・
            <a href="/privacy">隱私政策</a>
          </span>
        </footer>
      </div>
    </div>
  );
}
