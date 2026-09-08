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

interface BrowserParts {
  name: string;
  version: string;
}

/** 解析 UA 為「瀏覽器名稱」與「瀏覽器版本」（對齊圖 1 的 瀏覽器／瀏覽器版本 兩欄）。 */
function browserParts(uaText: string): BrowserParts {
  if (!uaText) return { name: DASH, version: '' };
  const grab = (pattern: RegExp): string => {
    const hit = uaText.match(pattern)?.[1];
    return typeof hit === 'string' ? hit : '';
  };
  if (/EdgA?\//i.test(uaText)) return { name: 'Edge', version: grab(/EdgA?\/([\d.]+)/i) };
  if (/OPR\//.test(uaText)) return { name: 'Opera', version: grab(/OPR\/([\d.]+)/) };
  if (/Firefox\//i.test(uaText)) return { name: 'Firefox', version: grab(/Firefox\/([\d.]+)/i) };
  if (/CriOS\//i.test(uaText)) return { name: 'Chrome iOS', version: grab(/CriOS\/([\d.]+)/) };
  if (/Chrome\//i.test(uaText)) return { name: 'Chrome', version: grab(/Chrome\/([\d.]+)/) };
  if (/Version\//i.test(uaText) && /Safari\//i.test(uaText)) {
    return { name: 'Safari', version: grab(/Version\/([\d.]+)/i) };
  }
  const first = uaText.split(' ')[0];
  return { name: typeof first === 'string' && first.length > 0 ? first : DASH, version: '' };
}

/** 摘要列「瀏覽器」欄位：名稱＋版本（例如 Chrome 131.0.6778.109）。 */
function browserLabel(uaText: string): string {
  const parts = browserParts(uaText);
  return parts.version ? `${parts.name} ${parts.version}` : parts.name;
}

/** 摘要列「你」欄位：Client Hints platform → navigator.platform → UA 推估 OS。 */
function youPlatform(signals: NormalizedSignal[]): string {
  const ch = valueOf(signals, 'clientHints');
  const chPlatform = asStr(ch, 'platform');
  if (chPlatform) return chPlatform;
  const ua = valueOf(signals, 'ua');
  const uaPlatform = asStr(ua, 'platform');
  if (uaPlatform) return uaPlatform;
  return osName(signals);
}

function asBool(rec: Record<string, unknown> | null | undefined, key: string): boolean | undefined {
  const v = rec?.[key];
  return typeof v === 'boolean' ? v : undefined;
}

/** UTC 偏移（小時，可含 .5）→ UTC+08:00 樣式。 */
function offsetLabel(offsetHours: number): string {
  const sign = offsetHours >= 0 ? '+' : '-';
  const abs = Math.abs(offsetHours);
  const hh = Math.floor(abs);
  const mm = Math.round((abs - hh) * 60);
  return `UTC${sign}${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** 時區欄位：名稱＋偏移（例如 Asia/Taipei (UTC+08:00)）。 */
function timezoneLabel(signals: NormalizedSignal[]): string {
  const tz = valueOf(signals, 'timezone');
  const name = asStr(tz, 'timezone');
  const offset = asNum(tz, 'offsetHours');
  if (!name && offset === undefined) return DASH;
  const offsetPart = offset !== undefined ? ` (${offsetLabel(offset)})` : '';
  return `${name ?? DASH}${offsetPart}`;
}

/** 在指定 IANA 時區格式化「現在時間」（基於 IP 的時區）；無效或失敗回 —。 */
function timeInZone(zone: string | undefined): string {
  if (!zone) return DASH;
  try {
    return new Intl.DateTimeFormat('zh-TW', {
      hour12: false,
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date());
  } catch {
    return DASH;
  }
}

/** 本地時間：timezone 訊號 localTime（ISO）轉本機時區顯示。 */
function localTimeLabel(signals: NormalizedSignal[]): string {
  const tz = valueOf(signals, 'timezone');
  const raw = asStr(tz, 'localTime');
  if (!raw) return DASH;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? DASH : d.toLocaleString('zh-TW', { hour12: false });
}

/** Do Not Track（ua 訊號 navigator.doNotTrack）。 */
function doNotTrackLabel(signals: NormalizedSignal[]): string {
  const ua = valueOf(signals, 'ua');
  const raw = ua?.doNotTrack;
  if (typeof raw !== 'string' || raw.length === 0) return DASH;
  if (raw === '1') return '是';
  if (raw === '0') return '否';
  if (raw === 'unspecified') return '未指定';
  return raw;
}

/** Cookie（ua 訊號 navigator.cookieEnabled）。 */
function cookieEnabledLabel(signals: NormalizedSignal[]): string {
  const ua = valueOf(signals, 'ua');
  const enabled = asBool(ua, 'cookieEnabled');
  return enabled === undefined ? DASH : enabled ? '是' : '否';
}

/** 語言欄位：locale.language → ua.language。 */
function languageLabel(signals: NormalizedSignal[]): string {
  const locale = valueOf(signals, 'locale');
  const ua = valueOf(signals, 'ua');
  return asStr(locale, 'language') ?? asStr(ua, 'language') ?? DASH;
}

/** Internationalization API：locale 訊號 intlLocale。 */
function intlLocaleLabel(signals: NormalizedSignal[]): string {
  return asStr(valueOf(signals, 'locale'), 'intlLocale') ?? DASH;
}

/** 螢幕解析度／可用螢幕尺寸（screen 訊號 resolution／availResolution）。 */
function screenValue(signals: NormalizedSignal[], key: string): string {
  return asStr(valueOf(signals, 'screen'), key) ?? DASH;
}

function screenColorDepthLabel(signals: NormalizedSignal[]): string {
  const depth = asNum(valueOf(signals, 'screen'), 'colorDepth');
  return depth !== undefined ? `${depth} bit` : DASH;
}

function touchSupportLabel(signals: NormalizedSignal[]): string {
  const points = asNum(valueOf(signals, 'screen'), 'maxTouchPoints');
  if (points === undefined) return DASH;
  return points > 0 ? `是（${points} 點）` : '否';
}

/** 訪客 ID：report.subjectId ?? report.sessionId。 */
function visitorIdLabel(report: EnvironmentReport): string {
  return truncate(report.subjectId ?? report.sessionId, 24);
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
  /** 摘要中需放大顯示的欄位（IP，置於摘要列最後）。 */
  big?: boolean;
}

function keywordHits(data: OvData): string[] {
  return [
    ...(data.score.explanations ?? []).map((e) => e.ruleId.toLowerCase()),
    ...data.report.issues.map((i) => i.type.toLowerCase()),
  ];
}

/** 機器人偵測：沿用既有推估（score.explanations / report.issues 關鍵字），伺服器成功時才有值。 */
function botDetectionLabel(data: OvData): string {
  if (!data.network) return DASH;
  return keywordHits(data).some((w) => w.includes('bot')) ? '是' : '否';
}

/** 黑名單：沿用既有推估（blacklist / reputation 關鍵字），伺服器成功時才有值。 */
function blacklistLabel(data: OvData): string {
  if (!data.network) return DASH;
  return keywordHits(data).some((w) => w.includes('blacklist') || w.includes('reputation'))
    ? '是'
    : '否';
}

/**
 * 圖 1（BrowserScan/tc）頂部快速摘要（兩欄「標籤:值」列）。
 * 順序：頁面 → 瀏覽器 → 你 → IP 時區 → 地理位置 → 語言 → 郵政編碼 → ISP →
 * 代理伺服器 → 匿名服務 → 黑名單 → DNS Leak → 機器人偵測 → IP（放大）。
 * 值取不到顯示 —；伺服器上傳失敗（降級）時伺服器欄位一律 —。
 */
function buildSummaryRows(data: OvData): SummaryRow[] {
  const signals = data.report.signals;
  const network = data.network;
  const geo = geoOf(network);
  const serverOk = Boolean(network);

  const ua = valueOf(signals, 'ua');
  const uaText = asStr(ua, 'userAgent') ?? '';

  const geoPlace = [asStr(geo, 'country'), asStr(geo, 'region'), asStr(geo, 'city')]
    .filter(Boolean)
    .join(' / ');
  const publicIp = webrtcPublicIp(signals, network);
  const ipValue = serverOk && network?.ip ? network.ip : publicIp;

  const ispValue = (() => {
    const isp = asStr(geo, 'isp');
    const asn = asStr(geo, 'asn');
    if (!isp) return DASH;
    return asn ? `${isp}（AS ${asn}）` : isp;
  })();

  const anonParts: string[] = [];
  if (network?.vpn) anonParts.push('VPN');
  if (network?.tor) anonParts.push('Tor');
  if (network?.datacenter) anonParts.push('資料中心');

  return [
    { label: '頁面', value: data.pageUrl || DASH },
    { label: '瀏覽器', value: browserLabel(uaText) },
    { label: '你', value: youPlatform(signals) },
    { label: 'IP 時區', value: asStr(geo, 'timezone') ?? DASH },
    { label: '地理位置', value: geoPlace || DASH },
    { label: '語言', value: languageLabel(signals) },
    { label: '郵政編碼', value: DASH },
    { label: 'ISP', value: ispValue },
    { label: '代理伺服器', value: serverOk ? yesNo(network?.proxy) : DASH },
    {
      label: '匿名服務',
      value: serverOk ? (anonParts.length > 0 ? `是（${anonParts.join('、')}）` : '否') : DASH,
    },
    { label: '黑名單', value: blacklistLabel(data) },
    { label: 'DNS Leak', value: network?.dnsLeak ? yesNo(network.dnsLeak.detected) : DASH },
    { label: '機器人偵測', value: botDetectionLabel(data) },
    { label: 'IP', value: ipValue, big: true },
  ];
}

/* ------------------------------------------------------------------ */
/* 畫面小元件                                                            */
/* ------------------------------------------------------------------ */

function Field({ label, value }: { label: string; value: string }) {
  const na = value === DASH;
  return (
    <div className={`ov-field${na ? ' ov-field-na' : ''}`}>
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
  const summaryRows = current ? buildSummaryRows(current) : [];
  const summaryNormal = summaryRows.filter((row) => !row.big);
  const summaryBig = summaryRows.find((row) => row.big);
  const uaText = asStr(valueOf(signals, 'ua'), 'userAgent') ?? '';

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
                {summaryNormal.map((row) => (
                  <div
                    className={`ov-summary-item${row.value === DASH ? ' ov-summary-empty' : ''}`}
                    key={row.label}
                  >
                    <span className="ov-summary-label">{row.label}</span>
                    <span className="ov-summary-value" title={row.value === DASH ? undefined : row.value}>
                      {row.value}
                    </span>
                  </div>
                ))}
                {summaryBig && (
                  <div
                    className={`ov-summary-ip${summaryBig.value === DASH ? ' ov-summary-empty' : ''}`}
                  >
                    <span className="ov-summary-label">{summaryBig.label}</span>
                    <span className="ov-summary-value" title={summaryBig.value}>
                      {summaryBig.value}
                    </span>
                  </div>
                )}
              </div>
            </section>

            {/* 主區標題 + 資訊卡片網格 */}
            <h2 className="ov-main-title">哪些信息會被網站看到</h2>

            <div className="ov-grid">
              {/* ── IP 地址卡 ─────────────────────────────── */}
              <Card icon="🌐" title="IP 地址" className="ov-card-half">
                <Field label="IP" value={network?.ip ?? webrtcPublicIp(signals, network)} />
                <Field label="WebRTC" value={webrtcPublicIp(signals, network)} />
                <Field
                  label="WebRTC STUN"
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
              <Card icon="🗺️" title="地理位置" className="ov-card-half">
                <Field label="國家 / 地區" value={asStr(geo, 'country') ?? DASH} />
                <Field label="州 / 省" value={asStr(geo, 'region') ?? DASH} />
                <Field label="城市" value={asStr(geo, 'city') ?? DASH} />
                <Field
                  label="緯度"
                  value={(() => {
                    const lat = asNum(geo, 'latitude');
                    return lat !== undefined ? lat.toFixed(4) : DASH;
                  })()}
                />
                <Field
                  label="經度"
                  value={(() => {
                    const lng = asNum(geo, 'longitude');
                    return lng !== undefined ? lng.toFixed(4) : DASH;
                  })()}
                />
              </Card>

              {/* ── 硬件卡 ─────────────────────────────────── */}
              <Card icon="🖥️" title="硬件" className="ov-card-half ov-card-cols">
                <Field label="訪客ID" value={visitorIdLabel(current.report)} />
                <Field label="Canvas" value={hashHead(signalOf(signals, 'canvas')?.hash)} />
                <Field label="WebGL" value={hashHead(signalOf(signals, 'webgl')?.hash)} />
                <Field label="WebGL Report" value={DASH} />
                <Field label="廠商" value={asStr(valueOf(signals, 'webgl'), 'vendor') ?? DASH} />
                <Field label="渲染" value={asStr(valueOf(signals, 'webgl'), 'renderer') ?? DASH} />
                <Field label="Audio" value={hashHead(signalOf(signals, 'audio')?.hash)} />
                <Field label="Client Rects" value={DASH} />
                <Field label="WebGPU Report" value={hashHead(signalOf(signals, 'webgpu')?.hash)} />
                <Field label="屏幕分辨率" value={screenValue(signals, 'resolution')} />
                <Field label="可用屏幕尺寸" value={screenValue(signals, 'availResolution')} />
                <Field label="顏色深度" value={screenColorDepthLabel(signals)} />
                <Field label="觸摸支持" value={touchSupportLabel(signals)} />
                <Field label="媒體設備" value={DASH} />
                <p className="ov-note">
                  {(() => {
                    const parts: string[] = [];
                    if (current.nav.cores && current.nav.cores > 0) parts.push(`CPU ${current.nav.cores} 核心`);
                    if (current.nav.memoryGb) parts.push(`記憶體 ${current.nav.memoryGb} GB`);
                    if (current.nav.connectionType) parts.push(`連線類型 ${current.nav.connectionType}`);
                    return parts.length > 0 ? `本機補充：${parts.join(' ・ ')}（非掃描訊號）。` : '';
                  })()}
                </p>
              </Card>

              {/* ── 瀏覽器卡 ───────────────────────────────── */}
              <Card icon="🧬" title="瀏覽器" className="ov-card-half ov-card-cols">
                <Field label="隱身模式" value={DASH} />
                <Field label="操作系統" value={osName(signals)} />
                <Field label="瀏覽器" value={browserParts(uaText).name} />
                <Field label="瀏覽器版本" value={browserParts(uaText).version || DASH} />
                <Field label="Header" value={DASH} />
                <Field label="JavaScript" value={DASH} />
                <Field label="軟件" value={DASH} />
                <Field label="基於IP的時區" value={asStr(geo, 'timezone') ?? DASH} />
                <Field label="時區" value={timezoneLabel(signals)} />
                <Field label="基於IP的時間" value={timeInZone(asStr(geo, 'timezone'))} />
                <Field label="本地時間" value={localTimeLabel(signals)} />
                <Field label="語言" value={languageLabel(signals)} />
                <Field label="請求頭語言" value={DASH} />
                <Field label="Internationalization API" value={intlLocaleLabel(signals)} />
                <Field label="機器人偵測" value={botDetectionLabel(current)} />
                <Field label="Do Not Track" value={doNotTrackLabel(signals)} />
                <Field label="Javascript" value={DASH} />
                <Field label="Flash" value={DASH} />
                <Field label="ActiveX" value={DASH} />
                <Field label="Java" value={DASH} />
                <Field label="Cookie" value={cookieEnabledLabel(signals)} />
                <Field label="端口檢測（22 / 3389）" value={DASH} />
                <Field label="字體" value={DASH} />
                <Field label="字體列表" value={DASH} />
                <p className="ov-note">
                  字型／軟件／隱身模式／端口／Flash／ActiveX／Java 等欄位尚無對應採集模組或伺服器資料，故顯示 —。
                </p>
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
