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

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
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
  listPageBlocks,
  policyDecisionForRiskLevel,
  type EnvironmentReport,
  type NormalizedSignal,
  type PolicyDecision,
} from '@shieldscan/core-schema';
import type { ScoreResult } from '@shieldscan/scoring-engine';
import { analyzeSignals } from '../lib/analyze';
import { submitReport, type ServerNetworkAnalysis } from '../lib/api';

/* ------------------------------------------------------------------ */
/* 明暗模式（localStorage key：shieldscan.theme；html[data-theme] 驅動）  */
/* ------------------------------------------------------------------ */

const THEME_KEY = 'shieldscan.theme';

type ThemeMode = 'light' | 'dark' | 'auto';

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw;
  } catch {
    /* localStorage 不可用時退回跟隨系統 */
  }
  return 'auto';
}

function resolvedTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'auto') return prefersDark() ? 'dark' : 'light';
  return mode;
}

/** 切換 html[data-theme]，全頁（含 .ov-experience 色板）即時生效。 */
function setHtmlTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolvedTheme(mode);
}

function persistTheme(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* 忽略 */
  }
}

/** 模組載入第一時間同步（避免載入閃爍）：先讀 localStorage，無則跟隨系統。 */
if (typeof window !== 'undefined') {
  try {
    setHtmlTheme(readStoredTheme());
  } catch {
    /* noop */
  }
}

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

/* ------------------------------------------------------------------ */
/* 版面設定整合（/admin/layout →「掃描總覽」頁）                          */
/*   - 同一來源：core-schema 註冊表（listPageBlocks('scan-overview')）   */
/*     ＋ localStorage `ss.layout.v1.scan-overview`（編輯器與本頁共用）。  */
/*   - order：區塊渲染順序；disabled：停用區塊（不渲染）。                 */
/*   - 讀不到設定（或尚未載入）＝全部預設顯示（defaultEnabled），           */
/*     與現行行為完全一致。                                             */
/* ------------------------------------------------------------------ */

const OV_PAGE_KEY = 'scan-overview' as const;
const OV_LAYOUT_KEY = `ss.layout.v1.${OV_PAGE_KEY}`;

/** 本頁實際有 JSX 的區塊（與 core-schema 註冊的 ov.* 對應；尚未有 JSX 的未來區塊不列）。 */
const OV_RENDER_KEYS: readonly string[] = [
  'ov.toolbar',
  'ov.hero',
  'ov.issues',
  'ov.ip',
  'ov.location',
  'ov.hardware',
  'ov.browser',
  'ov.software',
];

/** 落在「資訊卡片網格」（.ov-grid）內的區塊。 */
const OV_CARD_KEYS: readonly string[] = [
  'ov.ip',
  'ov.location',
  'ov.hardware',
  'ov.browser',
  'ov.software',
];

/** CSS order 給值上限：清單找不到的 key 一律排最後（永不與註記衝突）。 */
const OV_FALLBACK_RANK = 900;

interface OvLayout {
  order: string[];
  disabled: string[];
}

/** 預設版面：依 core-schema defaultPosition 排序、全部啟用。 */
function defaultOvLayout(): OvLayout {
  const defs = listPageBlocks(OV_PAGE_KEY)
    .filter((d) => OV_RENDER_KEYS.includes(d.key))
    .sort((a, b) => a.defaultPosition - b.defaultPosition);
  return {
    order: defs.map((d) => d.key),
    disabled: defs.filter((d) => !d.defaultEnabled).map((d) => d.key),
  };
}

/**
 * 讀取版面設定：
 * - 儲存順序優先（編輯器寫入的排序），未知／已下架 key 剔除，
 *   新註冊區塊依預設位置補在尾端；
 * - disabled 只保留已知區塊；
 * - 任一環節出錯或無設定 → 回傳全預設（現行行為不變）。
 */
function readOvLayout(): OvLayout {
  const base = defaultOvLayout();
  if (typeof window === 'undefined') return base;
  try {
    const raw = window.localStorage.getItem(OV_LAYOUT_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as { order?: unknown; disabled?: unknown } | null;
    if (!parsed || typeof parsed !== 'object') return base;
    const known = new Set<string>(OV_RENDER_KEYS);
    const storedOrder = Array.isArray(parsed.order)
      ? parsed.order.filter((k): k is string => typeof k === 'string' && known.has(k))
      : [];
    const order =
      storedOrder.length > 0
        ? [...storedOrder, ...base.order.filter((k) => !storedOrder.includes(k))]
        : base.order;
    const disabled = Array.isArray(parsed.disabled)
      ? parsed.disabled.filter((k): k is string => typeof k === 'string' && known.has(k))
      : base.disabled;
    return { order, disabled };
  } catch {
    return base;
  }
}

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

/** 複製純文字到剪貼簿：先試 navigator.clipboard，失敗退回 execCommand 方案。 */
async function copyPlainText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 走 fallback */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
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

/** 語言列表（navigator.languages 實測）。 */
function languagesLabel(signals: NormalizedSignal[]): string {
  const locale = valueOf(signals, 'locale');
  const raw = locale?.languages;
  if (Array.isArray(raw)) {
    const langs = raw.filter((item): item is string => typeof item === 'string');
    if (langs.length > 0) return langs.join(', ');
  }
  return languageLabel(signals);
}

/** Accept-Language 標頭近似值：由 navigator.languages 依 q 加權推估（瀏覽器不直接暴露標頭）。 */
function acceptLanguageApprox(signals: NormalizedSignal[]): string {
  const locale = valueOf(signals, 'locale');
  const raw = locale?.languages;
  const langs = Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string')
    : [];
  if (langs.length === 0) return languageLabel(signals);
  return langs
    .map((lang, i) => (i === 0 ? lang : `${lang};q=${Math.max(0.1, 1 - i * 0.1).toFixed(1)}`))
    .join(', ');
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

/* ------------------------------------------------------------------ */
/* 地理位置行（工具列 IP 下方）與國家旗 emoji                              */
/* ------------------------------------------------------------------ */

/**
 * countryCode（ISO 3166-1 alpha-2，server 為 ip-api 所提供）→ 國旗 emoji。
 * offset 127397：code 大寫兩字 → 逐字元 codePointAt 相減後 fromCodePoint。
 */
function flagEmojiFromCode(countryCode: string | undefined): string {
  if (!countryCode) return '';
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map((ch) => 127397 + (ch.codePointAt(0) ?? 0)));
}

/** 無 countryCode 時的小型常用國家名稱對照（中文／英文名 → code），再轉 emoji。 */
const COUNTRY_CODE_FALLBACK: Record<string, string> = {
  越南: 'VN',
  vietnam: 'VN',
  台灣: 'TW',
  台湾: 'TW',
  taiwan: 'TW',
  中國: 'CN',
  中国: 'CN',
  china: 'CN',
  美國: 'US',
  美国: 'US',
  'united states': 'US',
  usa: 'US',
  日本: 'JP',
  japan: 'JP',
  韓國: 'KR',
  韩国: 'KR',
  'south korea': 'KR',
  korea: 'KR',
  新加坡: 'SG',
  singapore: 'SG',
  泰國: 'TH',
  泰国: 'TH',
  thailand: 'TH',
  印尼: 'ID',
  indonesia: 'ID',
  馬來西亞: 'MY',
  马来西亚: 'MY',
  malaysia: 'MY',
  香港: 'HK',
  'hong kong': 'HK',
  澳門: 'MO',
  澳门: 'MO',
  macau: 'MO',
  macao: 'MO',
};

/** geo.countryCode 原始值（geo 型別未宣告該欄時以 Record 方式讀取）。 */
function countryCodeOf(geo: RichGeo | null): string | undefined {
  const raw = (geo as Record<string, unknown> | null)?.countryCode;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
}

/** 國家旗 emoji：優先 geo.countryCode → 退常用國家名稱對照；皆無 → 空字串（不顯示旗）。 */
function countryFlagEmoji(geo: RichGeo | null): string {
  const fromCode = flagEmojiFromCode(countryCodeOf(geo));
  if (fromCode) return fromCode;
  const country = asStr(geo, 'country');
  if (!country) return '';
  const code = COUNTRY_CODE_FALLBACK[country.trim().toLowerCase()];
  return code ? flagEmojiFromCode(code) : '';
}

/** countryCode（含名稱 fallback）→ 兩字 code；無則空字串（供旗幟圖片用）。 */
function countryFlagCodeOf(geo: RichGeo | null): string {
  const direct = countryCodeOf(geo);
  if (direct && /^[A-Za-z]{2}$/.test(direct)) return direct.toUpperCase();
  const country = asStr(geo, 'country');
  if (!country) return '';
  return COUNTRY_CODE_FALLBACK[country.trim().toLowerCase()] ?? '';
}

/**
 * 工具列地理位置行內容：`city / 旗 country`（旗緊鄰國家文字前方）。
 * 缺城市或國家時顯示有者；皆無顯示 —。
 */
function geoLineValue(geo: RichGeo | null): string {
  if (!geo) return DASH;
  const city = asStr(geo, 'city');
  const country = asStr(geo, 'country');
  if (!city && !country) return DASH;
  const flag = countryFlagEmoji(geo);
  const countryPart = country ? (flag ? `${flag} ${country}` : country) : '';
  if (city && countryPart) return `${city} / ${countryPart}`;
  return countryPart || city || DASH;
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

/** 扣分項 ruleId / issue type → 易懂中文名稱（圖 1 Issues 慣例；未列出的回退原始值）。 */
const ISSUE_ZH: Record<string, string> = {
  canvas_tamper: 'Canvas 指紋篡改',
  canvas_tampered: 'Canvas 指紋篡改',
  os_mismatch: '作業系統不一致',
  dns_leak: 'DNS 洩漏',
  webrtc_leak: 'WebRTC IP 洩漏',
  webrtc_local_ip: 'WebRTC 本地 IP 洩漏',
  open_ports_ssh_rdp: '異常端口開放（22 / 3389）',
  bot_detected: '機器人特徵偵測',
  server_datacenter_ip: '資料中心 IP 連線',
  server_tor_ip: 'Tor 出口連線',
  server_vpn_detected: 'VPN 連線偵測',
  server_proxy_detected: 'Proxy 代理伺服器偵測',
  server_ip_velocity: '同裝置 7 天 IP 速度異常',
  server_header_incoherence: '請求標頭一致性異常',
};

function issueZhName(key: string): string {
  return ISSUE_ZH[key] ?? key;
}

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
 * 圖 1 頂部概覽 Overview（兩欄「標籤:值」列）。
 * 順序：IP 地址 → 地理位置(城市/國家) → Browser(名稱+版本) → Platform →
 * IP Time Zone → Location(經緯度) → Language → Postal Code → ISP →
 * Proxy → Anonymous → Blacklist → DNS Leak → Bot Detection。
 * 值取不到顯示 —；伺服器上傳失敗（降級）時伺服器欄位一律 —。
 * 隱私評分大數字另以 hero 區塊呈現（見 ov-hero-score），不在此列。
 */
function buildSummaryRows(data: OvData): SummaryRow[] {
  const signals = data.report.signals;
  const network = data.network;
  const geo = geoOf(network);
  const serverOk = Boolean(network);

  const ua = valueOf(signals, 'ua');
  const uaText = asStr(ua, 'userAgent') ?? '';

  const geoCityCountry = (() => {
    const city = asStr(geo, 'city');
    const country = asStr(geo, 'country');
    if (!city && !country) return '';
    if (city && country) return `${city}, ${country}`;
    return city ?? country ?? '';
  })();

  const publicIp = webrtcPublicIp(signals, network);
  const ipValue = serverOk && network?.ip ? network.ip : publicIp;

  const coordsValue = (() => {
    const lat = asNum(geo, 'latitude');
    const lng = asNum(geo, 'longitude');
    return lat !== undefined && lng !== undefined ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : DASH;
  })();

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
    { label: 'IP 地址', value: ipValue },
    { label: '地理位置', value: geoCityCountry || DASH },
    { label: '瀏覽器', value: browserLabel(uaText) },
    { label: '平台', value: youPlatform(signals) },
    { label: 'IP 時區', value: asStr(geo, 'timezone') ?? DASH },
    { label: '經緯度', value: coordsValue },
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
  style,
  children,
}: {
  icon: string;
  title: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <section className={`ov-card ${className}`} style={style}>
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

/**
 * 「掃描進度」區塊（位於 Issues 上方；僅掃描中顯示，完成即自動隱藏／收合）。
 * 預設收合只看到進度條（bar 顏色 --ov-accent）；展開「詳細」才列出各模組
 * ✅/⏳/❌ ＋模組名＋耗時（語意與 classic 模組進度列相同）。
 */
function ScanProgressBlock({
  progress,
  percent,
  open,
  onToggle,
  style,
}: {
  progress: ScanProgressEvent[];
  percent: number;
  open: boolean;
  onToggle: () => void;
  style?: CSSProperties;
}) {
  return (
    <section className="ov-card ov-scan-progress" aria-label="掃描進度" style={style}>
      <div className="ov-card-head">
        <span className="ov-scan-spinner" aria-hidden="true" />
        <h3 className="ov-card-title">掃描中… {percent}%</h3>
        <button
          type="button"
          className="ov-detail-toggle"
          aria-expanded={open}
          aria-controls="ov-scan-detail-list"
          onClick={onToggle}
        >
          {open ? '收合' : '詳細'}
          <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
      </div>
      <div
        className="ov-scan-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`掃描進度 ${percent}%`}
      >
        <div className="ov-scan-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      {open && (
        <div className="ov-scan-details" id="ov-scan-detail-list">
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
                  {p.status === 'completed' && (
                    <span className="ov-progress-ms">{Math.round(p.durationMs)} ms</span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
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
  /** 「掃描進度」詳細（模組行）是否展開；預設收合，掃描結束自動收合。 */
  const [progressOpen, setProgressOpen] = useState(false);
  const [scanError, setScanError] = useState<string>();
  const [armed, setArmed] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>('auto');
  /** 目前掃描的發起方式：首次自動（安靜）或手動重新掃描；模組進度一律由「掃描進度」區塊呈現。 */
  const [scanKind, setScanKind] = useState<'auto' | 'manual'>('auto');
  /** 版面設定：初始＝預設全顯示（SSR/首幀一致）；mount 後讀取 localStorage 再套用。 */
  const [ovLayout, setOvLayout] = useState<OvLayout>(() => defaultOvLayout());
  const [copiedTip, setCopiedTip] = useState(false);
  const copyTimerRef = useRef<number | undefined>(undefined);
  const dataRef = useRef<OvData | null>(null);

  // 掛載後才讀取 localStorage（避免 SSR/水合不一致）；html 主題已在模組載入時同步。
  useEffect(() => {
    setThemeMode(readStoredTheme());
  }, []);

  // 掛載後讀取 /admin/layout「掃描總覽」版面（localStorage ss.layout.v1.scan-overview）。
  // 讀不到或解析失敗時維持預設＝全部顯示（行為與未接版面時一致）。
  useEffect(() => {
    setOvLayout(readOvLayout());
  }, []);

  // 「跟隨系統」時監聽系統明暗變化，即時切換 html[data-theme]。
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      setHtmlTheme(themeMode);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [themeMode]);

  // 掃描結束（busy → false）即自動收合「詳細」，避免模組行一直佔位。
  useEffect(() => {
    if (!busy) setProgressOpen(false);
  }, [busy]);

  const chooseTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    persistTheme(mode);
    setHtmlTheme(mode);
  };

  // 複製當下 IP（network.ip → WebRTC 公網），成功後顯示「已複製」1.5 秒。
  const handleCopyIp = async () => {
    if (toolbarIp === DASH) return;
    const ok = await copyPlainText(toolbarIp);
    if (!ok) return;
    setCopiedTip(true);
    if (copyTimerRef.current !== undefined) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopiedTip(false), 1500);
  };

  const runScan = async (autoScan = false) => {
    setBusy(true);
    setScanKind(autoScan ? 'auto' : 'manual');
    setScanError(undefined);
    setProgress([]);
    setProgressOpen(false);
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
    void runScan(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = data ?? dataRef.current;
  const completed = progress.filter((p) => p.status === 'completed').length;
  const scanPercent = progress.length === 0 ? 0 : Math.round((completed / MODULES.length) * 100);
  const network = current?.network;
  const geo = geoOf(network);
  const signals = current?.report.signals ?? [];
  const summaryRows = current ? buildSummaryRows(current) : [];
  const uaText = asStr(valueOf(signals, 'ua'), 'userAgent') ?? '';
  const toolbarIp = current ? (network?.ip ?? webrtcPublicIp(signals, network)) : DASH;
  /** 工具列地理位置行（IP 下方小字）：`city / 旗 country`，皆無 → —。 */
  const geoLine = geoLineValue(geo);
  /** 結構化拆解（旗以獨立 span 緊鄰國家名稱，確保圖示明確顯示）。 */
  const geoCity = asStr(geo, 'city');
  const geoCountry = asStr(geo, 'country');
  const geoFlag = countryFlagEmoji(geo);
  const geoFlagCode = countryFlagCodeOf(geo);
  const geoFlagSrc = geoFlagCode
    ? `https://flagcdn.com/w40/${geoFlagCode.toLowerCase()}.png`
    : '';
  const hasGeo = Boolean(geoCity || geoCountry);

  /* ---- 版面設定判定（ovLayout：order 排序／disabled 停用） ---- */
  const ovVisible = (k: string): boolean => !ovLayout.disabled.includes(k);
  const ovRankOf = (k: string): number => {
    const i = ovLayout.order.indexOf(k);
    return i < 0 ? OV_FALLBACK_RANK : i;
  };
  /** 每個區塊一個條件 wrapper：停用 → 不渲染（display:none，其餘依序排列）；啟用 → 依 layout.order 給 CSS order。 */
  const ovStyle = (k: string): CSSProperties =>
    ovVisible(k) ? { order: ovRankOf(k) } : { order: ovRankOf(k), display: 'none' };
  const heroVisible = ovVisible('ov.hero');
  const issuesVisible = ovVisible('ov.issues');
  const cardsShown = OV_CARD_KEYS.filter(ovVisible).sort((a, b) => ovRankOf(a) - ovRankOf(b));
  const cardsVisible = cardsShown.length > 0;
  /** 「主區標題＋資訊卡網格」整組的 order＝啟用卡片中最前面的位置（維持卡片容器為一個網格）。 */
  const cardsGroupRank = cardsVisible ? Math.min(...cardsShown.map(ovRankOf)) : OV_FALLBACK_RANK;
  const ovEmptyHintVisible = !heroVisible && !issuesVisible && !cardsVisible;

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
            <div className="ov-theme-switch" role="group" aria-label="明暗模式">
              {(
                [
                  ['light', '亮色', '☀️'],
                  ['dark', '暗色', '🌙'],
                  ['auto', '跟隨系統', '🖥️'],
                ] as Array<[ThemeMode, string, string]>
              ).map(([mode, label, icon]) => (
                <button
                  type="button"
                  key={mode}
                  className={`ov-theme-btn${themeMode === mode ? ' is-active' : ''}`}
                  aria-pressed={themeMode === mode}
                  title={`${label}${mode === 'auto' ? '（依系統 prefers-color-scheme）' : ''}`}
                  onClick={() => chooseTheme(mode)}
                >
                  <span aria-hidden="true">{icon}</span>
                  {label}
                </button>
              ))}
            </div>
            <span className="ov-chip" title="此體驗固定以 standard 模式自動上傳分析">
              同意模式：standard
            </span>
            {current && (
              <span className={`ov-chip ${current.analysisSource === 'server' ? 'ov-chip-server' : 'ov-chip-local'}`}>
                {current.analysisSource === 'server' ? '伺服器分析' : '本機預覽'}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="ov-page">
        {/* 頂部工具列：📍 當下 IP（＋IP 地理位置小字）＋ 複製 ＋ 重新掃描（sticky）
            ov.toolbar 停用 → 整個工具列隱藏（其餘區塊設定不影響此處與掃描等待提示）。 */}
        <div
          className="ov-locbar"
          role="toolbar"
          aria-label="目前 IP 工具列"
          style={ovVisible('ov.toolbar') ? undefined : { display: 'none' }}
        >
          <span className="ov-loc-pin" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s-6.2-5.4-6.2-10.2A6.2 6.2 0 0 1 12 4.6a6.2 6.2 0 0 1 6.2 6.2C18.2 15.6 12 21 12 21z" />
              <circle cx="12" cy="10.8" r="2.4" />
            </svg>
          </span>
          <span className="ov-loc-id">
            <span className="ov-loc-ip" title={toolbarIp !== DASH ? `目前 IP：${toolbarIp}` : '尚未取得 IP'}>
              {toolbarIp}
            </span>
            <span
              className="ov-loc-geo"
              title={geoLine !== DASH ? `IP 地理位置：${geoLine}` : 'IP 地理位置尚未取得'}
            >
              {!hasGeo ? (
                DASH
              ) : (
                <>
                  {geoCity ? (
                    <>
                      {geoCity} <span className="ov-loc-geo-sep">/</span>{' '}
                    </>
                  ) : null}
                  {geoFlagSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="ov-loc-flag-img"
                      src={geoFlagSrc}
                      alt=""
                      width={18}
                      height={13.5}
                      loading="lazy"
                    />
                  ) : geoFlag ? (
                    <span className="ov-loc-flag" aria-hidden="true">
                      {geoFlag}
                    </span>
                  ) : null}
                  {geoCountry ? <span className="ov-loc-country">{geoCountry}</span> : null}
                </>
              )}
            </span>
          </span>
          <span className="ov-loc-sep" aria-hidden="true" />
          <button
            type="button"
            className="ov-loc-btn"
            aria-label="複製目前 IP"
            title="複製目前 IP"
            disabled={toolbarIp === DASH}
            onClick={() => void handleCopyIp()}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="11" height="11" rx="2.2" />
              <path d="M5 15V5.5A1.5 1.5 0 0 1 6.5 4H15" />
            </svg>
            {copiedTip && <span className="ov-copy-tip" role="status">已複製</span>}
          </button>
          <button
            type="button"
            className={`ov-loc-btn${busy ? ' is-spinning' : ''}`}
            aria-label={actionLabel}
            title={actionLabel}
            disabled={busy || !armed}
            onClick={() => void runScan()}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 11.5a8 8 0 1 0-2.2 5.6" />
              <path d="M20 4.8v5.2h-5.2" />
            </svg>
          </button>
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

        {/* 自動掃描期間／尚未有結果時：只放一行低調提示 + spinner，不出現模組列或按鈕面板 */}
        {!current && !scanError && (!busy || scanKind === 'auto') && (
          <div className="ov-auto-wait" role="status" aria-live="polite">
            <span className="ov-auto-spinner" aria-hidden="true" />
            <span>正在掃描環境，請稍候…</span>
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
          <div
            className="ov-results ov-fade-in"
            style={{ display: 'flex', flexDirection: 'column' }}
          >
            {/* 全部區塊都被版面設定停用時的提示（不影響掃描流程） */}
            {ovEmptyHintVisible && (
              <div className="ov-empty" style={{ order: 0 }}>
                已依版面設定隱藏此頁所有區塊（/admin/layout →「掃描總覽」可重新啟用）。
              </div>
            )}

            {/* ① 頂部概覽 Overview hero（深色）── 左：兩欄標籤:值摘要；右：隱私評分大數字 */}
            <section className="ov-hero" style={ovStyle('ov.hero')}>
              <div className="ov-hero-meta">
                <span className="ov-hero-chip">
                  來源：{current.analysisSource === 'server' ? '伺服器分析' : '本機預覽'}
                </span>
                <span className="ov-hero-chip">耗時 {current.elapsedMs} ms</span>
                <span className="ov-hero-chip">時間 {current.scannedAt}</span>
              </div>
              <div className="ov-hero-main">
                <div className="ov-hero-left">
                  <h2 className="ov-hero-title">快速摘要：網站從這次連線看到的你</h2>
                  <div className="ov-summary">
                    {summaryRows.map((row) => (
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
                  </div>
                </div>
                <div className="ov-hero-score">
                  <span className="ov-hero-score-label">隱私評分</span>
                  <div className={`ov-hero-score-num ov-score-${numTone(current.score.finalScore)}`}>
                    {current.score.finalScore}
                    <span className="ov-hero-score-unit">%</span>
                  </div>
                  <div className="ov-hero-score-auth">
                    瀏覽器指紋真實度：
                    <strong>
                      {typeof current.report.scores.authenticity === 'number' &&
                      Number.isFinite(current.report.scores.authenticity)
                        ? `${Math.round(current.report.scores.authenticity)}%`
                        : DASH}
                    </strong>
                  </div>
                  <div className="ov-hero-score-tags">
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
                  <div className="ov-hero-score-meta">
                    隱私軌 {Math.round(current.score.privacyScore)}/100 ・ 欺詐軌{' '}
                    {Math.round(current.score.fraudScore)}/100
                  </div>
                  <div className="ov-hero-score-foot">同意模式 standard ・ 分析來源：{current.analysisSource === 'server' ? '伺服器' : '本機（降級）'}</div>
                </div>
              </div>
            </section>

            {/* 掃描進度：位於 Issues 上方；僅掃描中顯示，完成即自動隱藏／收合，展開可看模組明細
                掃描中一律顯示（order:-1 置頂），不因區塊啟停設定而消失。 */}
            {busy && (
              <ScanProgressBlock
                progress={progress}
                percent={scanPercent}
                open={progressOpen}
                onToggle={() => setProgressOpen((prev) => !prev)}
                style={{ order: -1 }}
              />
            )}

            {/* ② 扣分項分析 Issues（名稱 -x% ＋說明＋證據） */}
            <Card
              icon="📉"
              title="扣分項分析 Issues"
              className="ov-card-wide ov-card-issues"
              style={ovStyle('ov.issues')}
            >
              {(() => {
                const explanations = current.score.explanations ?? [];
                const issues = current.report.issues ?? [];
                if (explanations.length === 0 && issues.length === 0) {
                  return <p className="ov-empty">未偵測到扣分項 — 這次連線的環境相當乾淨。🎉</p>;
                }
                return (
                  <>
                    {explanations.map((e) => {
                      const tone = sevTone(e.severity);
                      return (
                        <div className={`ov-issue ov-issue-${tone}`} key={e.ruleId}>
                          <div className="ov-issue-main">
                            <span className="ov-issue-name">{issueZhName(e.ruleId)}</span>
                            <span className="ov-issue-pct">-{e.points}%</span>
                          </div>
                          <div className="ov-issue-desc">{e.reason}</div>
                          <div className="ov-issue-meta">
                            規則 {e.ruleId} ・ {zhOr(TRACK_ZH, e.track, e.track)} ・{' '}
                            <Badge tone={tone}>{e.severity}</Badge>
                          </div>
                        </div>
                      );
                    })}
                    {issues.map((issue) => {
                      const tone = sevTone(issue.severity);
                      return (
                        <div className={`ov-issue ov-issue-${tone}`} key={issue.id}>
                          <div className="ov-issue-main">
                            <span className="ov-issue-name">{issueZhName(issue.type)}</span>
                            <Badge tone={tone}>{issue.severity}</Badge>
                          </div>
                          <div className="ov-issue-desc">{issue.description}</div>
                          <div className="ov-issue-meta">
                            {(() => {
                              const evidence =
                                issue.evidence && Object.keys(issue.evidence).length > 0
                                  ? truncate(JSON.stringify(issue.evidence), 160)
                                  : null;
                              return evidence ? (
                                <>
                                  證據：<code className="ov-issue-evidence">{evidence}</code>
                                </>
                              ) : null;
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </Card>

            {/* 主區標題 + 資訊卡片網格（至少一張資訊卡啟用時才顯示；卡片維持在 .ov-grid 容器內） */}
            {cardsVisible && (
              <h2 className="ov-main-title" style={{ order: cardsGroupRank }}>
                哪些信息會被網站看到
              </h2>
            )}

            {cardsVisible && (
              <div className="ov-grid" style={{ order: cardsGroupRank }}>
              {/* ── ③ IP address 詳情卡 ─────────────────────── */}
              <Card icon="🌐" title="IP 地址" className="ov-card-half" style={ovStyle('ov.ip')}>
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
                <Field label="ISP" value={asStr(geo, 'isp') ?? DASH} />
                <p className="ov-note">ISP 與 IP 計數（7 天）需伺服器／具身分後端，未取得時顯示 —。</p>
              </Card>

              {/* ── ④ Location 詳情卡 ──────────────────────── */}
              <Card icon="🗺️" title="地理位置" className="ov-card-half" style={ovStyle('ov.location')}>
                <Field label="國家 / 地區" value={asStr(geo, 'country') ?? DASH} />
                <Field label="州 / 省" value={asStr(geo, 'region') ?? DASH} />
                <Field label="城市" value={asStr(geo, 'city') ?? DASH} />
                <Field label="郵政編碼" value={DASH} />
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
                <p className="ov-note">郵政編碼需郵遞區號地理資料庫，目前未提供。</p>
              </Card>

              {/* ── ⑤ Hardware 硬體卡 ─────────────────────── */}
              <Card icon="🖥️" title="硬件" className="ov-card-half ov-card-cols" style={ovStyle('ov.hardware')}>
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
                <Field
                  label="設備內存"
                  value={current.nav.memoryGb ? `${current.nav.memoryGb} GB` : DASH}
                />
                <Field
                  label="邏輯處理器核心"
                  value={current.nav.cores && current.nav.cores > 0 ? `${current.nav.cores}` : DASH}
                />
                <Field label="媒體設備" value={DASH} />
                <p className="ov-note">
                  {(() => {
                    const parts: string[] = [];
                    if (current.nav.connectionType) parts.push(`連線類型 ${current.nav.connectionType}`);
                    return parts.length > 0 ? `本機補充：${parts.join(' ・ ')}（非掃描訊號）。` : '';
                  })()}
                  WebGL Report／Client Rects／媒體設備 未採集或需權限，顯示 —。
                </p>
              </Card>

              {/* ── ⑥ Browser 瀏覽器卡 ─────────────────────── */}
              <Card icon="🧬" title="瀏覽器" className="ov-card-half ov-card-cols" style={ovStyle('ov.browser')}>
                <Field label="隱身模式" value={DASH} />
                <Field label="設備型號" value={DASH} />
                <Field label="操作系統" value={osName(signals)} />
                <Field label="瀏覽器" value={browserParts(uaText).name} />
                <Field label="瀏覽器版本" value={browserParts(uaText).version || DASH} />
                <Field label="Header（請求標頭）" value={uaText ? truncate(uaText, 100) : DASH} />
                <Field label="JavaScript" value="是" />
                <p className="ov-note">
                  隱身模式／設備型號 無法由現有採集模組量測，顯示 —（需額外偵測技術）；Header
                  顯示掃描到的 User-Agent 字串。
                </p>
              </Card>

              {/* ── ⑦ Software 軟體卡 ──────────────────────── */}
              <Card icon="🧩" title="軟體" className="ov-card-wide ov-card-cols3" style={ovStyle('ov.software')}>
                <Field label="基於IP的時區" value={asStr(geo, 'timezone') ?? DASH} />
                <Field label="時區" value={timezoneLabel(signals)} />
                <Field label="基於IP的時間" value={timeInZone(asStr(geo, 'timezone'))} />
                <Field label="本地時間" value={localTimeLabel(signals)} />
                <Field label="語言" value={languagesLabel(signals)} />
                <Field label="請求頭語言" value={acceptLanguageApprox(signals)} />
                <Field label="Internationalization API" value={intlLocaleLabel(signals)} />
                <Field label="機器人偵測" value={botDetectionLabel(current)} />
                <Field label="Do Not Track" value={doNotTrackLabel(signals)} />
                <Field label="JavaScript" value="是" />
                <Field label="Flash" value={DASH} />
                <Field label="ActiveX" value={DASH} />
                <Field label="Java" value={DASH} />
                <Field label="Cookie" value={cookieEnabledLabel(signals)} />
                <Field label="端口檢測（僅檢測 22、3389）" value={DASH} />
                <Field label="字體" value={DASH} />
                <Field label="字體列表" value={DASH} />
                <p className="ov-note">
                  Cookie／Do Not Track／語言／時區 等為即時實測值；請求頭語言以 navigator.languages
                  近似。端口檢測／字體／字體列表／Flash／ActiveX／Java 未採集或需登入，顯示 —。
                </p>
              </Card>

            </div>
            )}

            <p className="ov-source-note" style={{ order: OV_FALLBACK_RANK + 1 }}>
              資料來源：@shieldscan/browser-sdk 10 個採集模組（UA / Client Hints / Canvas / WebGL /
              WebGPU / Audio / 螢幕 / 語言 / 時區 / WebRTC）→ analyzeSignals（standard）→
              submitReport（伺服器 network／score）。伺服器連線失敗時顯示降級警告並退回本機預覽。
            </p>
          </div>
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
