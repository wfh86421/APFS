/**
 * Phase A「自訂區塊＋版型」— Block Registry（M1）
 *
 * 單一事實來源：每一後台頁有哪些區塊、每塊可設定哪些「純資料欄位」、
 * 預設值與 zod 執行期驗證。UI 依欄位定義自動生表單；API 依 schema 驗證後才寫入。
 *
 * 原則（意向決策 D1=safe）：
 * - 設定只存「純文字 / 數值 / 列舉 / 開關 / 顏色」，永不儲存 HTML 或程式碼。
 * - tenant 隔離由 API 層（dashboard_blocks 表）負責；此處只管定義與驗證。
 */

import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* 頁面與權限列舉                                                       */
/* ------------------------------------------------------------------ */

export const ADMIN_PAGE_KEYS = [
  'overview',
  'reports',
  'events',
  'workbench',
  'devices',
  'homepage',
  'scan-overview',
  'governance',
] as const;
export type AdminPageKey = (typeof ADMIN_PAGE_KEYS)[number];

export type BlockAccessLevel = 'normal' | 'restricted';

export interface AdminPageDef {
  key: AdminPageKey;
  /** 既有路由，例如 /admin/overview */
  route: string;
  title: string;
  icon: string;
  description: string;
  /** restricted＝整頁僅 security_admin 可見（沿用現行），不可由租戶放寬。 */
  accessLevel: BlockAccessLevel;
}

/** 詳情頁例外：單一報告證據鏈版面不拆塊（僅整頁標題/品牌色可改，列為後續簡化項）。 */
export const NON_BLOCK_PAGE_NOTE =
  'admin/reports/[reportId] 詳情頁屬「單一報告證據鏈」版面，本輪不拆區塊；僅允許整頁標題與品牌色設定（後續簡化項）。';

/* ------------------------------------------------------------------ */
/* 欄位定義（可設定項目＝純資料）                                       */
/* ------------------------------------------------------------------ */

export type TextFieldDef = {
  kind: 'text';
  key: string;
  label: string;
  description?: string;
  default: string;
  max: number;
};

export type NumberFieldDef = {
  kind: 'number';
  key: string;
  label: string;
  description?: string;
  default: number;
  min: number;
  max: number;
};

export type SelectFieldDef = {
  kind: 'select';
  key: string;
  label: string;
  description?: string;
  default: string;
  options: readonly string[];
};

export type MultiSelectFieldDef = {
  kind: 'multiselect';
  key: string;
  label: string;
  description?: string;
  default: readonly string[];
  options: readonly string[];
  maxItems: number;
};

export type ToggleFieldDef = {
  kind: 'toggle';
  key: string;
  label: string;
  description?: string;
  default: boolean;
};

export type ColorFieldDef = {
  kind: 'color';
  key: string;
  label: string;
  description?: string;
  default: string;
};

export type BlockFieldDef =
  | TextFieldDef
  | NumberFieldDef
  | SelectFieldDef
  | MultiSelectFieldDef
  | ToggleFieldDef
  | ColorFieldDef;

/* ------------------------------------------------------------------ */
/* 區塊定義                                                             */
/* ------------------------------------------------------------------ */

export interface BlockDef {
  key: string;
  page: AdminPageKey;
  icon: string;
  title: string;
  description: string;
  /** 新租戶預設是否啟用（false＝預設停用、可自行啟用）。 */
  defaultEnabled: boolean;
  /** 同頁內預設排序（越小越前面）。 */
  defaultPosition: number;
  accessLevel: BlockAccessLevel;
  fields: readonly BlockFieldDef[];
}

/** 依欄位定義產出 zod schema（strict：拒絕未知鍵；含預設值）。 */
export function zBlockSettingsSchema(def: Pick<BlockDef, 'fields'>): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of def.fields) {
    shape[f.key] = fieldZod(f);
  }
  return z.object(shape).strict();
}

function fieldZod(f: BlockFieldDef): z.ZodTypeAny {
  switch (f.kind) {
    case 'text':
      return z.string().trim().max(f.max, `不可超過 ${f.max} 字`).default(f.default);
    case 'number':
      return z
        .number()
        .int()
        .min(f.min)
        .max(f.max, `範圍 ${f.min}–${f.max}`)
        .default(f.default);
    case 'select':
      return z
        .string()
        .refine((v) => f.options.includes(v), '不在允許選項內')
        .default(f.default);
    case 'multiselect':
      return z
        .array(z.string())
        .max(f.maxItems, `最多 ${f.maxItems} 項`)
        .refine((v) => v.every((x) => f.options.includes(x)), '含不允許的選項')
        .default([...f.default]);
    case 'toggle':
      return z.boolean().default(f.default);
    case 'color':
      return z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, '須為 #RRGGBB')
        .default(f.default);
  }
}

/** 區塊預設設定（欄位 key → 預設值）。 */
export function defaultSettingsFor(def: Pick<BlockDef, 'fields'>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) out[f.key] = f.default;
  return out;
}

export type BlockSettingsIssue = { field: string; message: string };
export type BlockSettingsResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; issues: BlockSettingsIssue[] };

const schemaCache = new Map<string, z.ZodTypeAny>();

/** 驗證某區塊的 settings（未知鍵→拒；缺欄位→以預設補）。 */
export function validateBlockSettings(
  blockKey: string,
  input: unknown,
): BlockSettingsResult {
  const def = BLOCK_REGISTRY[blockKey];
  if (!def) {
    return { ok: false, issues: [{ field: '$block', message: `未知區塊：${blockKey}` }] };
  }
  let schema = schemaCache.get(blockKey);
  if (!schema) {
    schema = zBlockSettingsSchema(def);
    schemaCache.set(blockKey, schema);
  }
  const result = schema.safeParse(input ?? {});
  if (result.success) {
    return { ok: true, data: result.data as Record<string, unknown> };
  }
  const issues: BlockSettingsIssue[] = [];
  for (const issue of result.error.issues.slice(0, 20)) {
    const field = issue.path.length > 0 ? issue.path.join('.') : '$root';
    issues.push({ field, message: issue.message });
  }
  return { ok: false, issues };
}

/* ------------------------------------------------------------------ */
/* 頁面與區塊資料（7 頁 / 30 區塊；依 M1 確認清單＋公開掃描總覽頁）        */
/* ------------------------------------------------------------------ */

export const ADMIN_PAGES: Record<AdminPageKey, AdminPageDef> = {
  overview: {
    key: 'overview',
    route: '/admin/overview',
    title: '總覽',
    icon: '📊',
    description: 'KPI 卡、趨勢、近期高風險。',
    accessLevel: 'normal',
  },
  reports: {
    key: 'reports',
    route: '/admin/reports',
    title: '報告',
    icon: '📄',
    description: '篩選列、列表、快速處置；詳情頁整頁固定不拆。',
    accessLevel: 'normal',
  },
  events: {
    key: 'events',
    route: '/admin/events',
    title: '風險事件',
    icon: '🚨',
    description: '事件過濾、串流與統計。',
    accessLevel: 'normal',
  },
  devices: {
    key: 'devices',
    route: '/admin/devices',
    title: '設備指紋',
    icon: '🧬',
    description: '設備統計與清單（清單預設停用）。',
    accessLevel: 'normal',
  },
  workbench: {
    key: 'workbench',
    route: '/admin',
    title: '工作台（6+1）',
    icon: '🛠️',
    description: '管理者工作台 6+1 分類卡：決策/異常/網路/硬體/瀏覽器/原始＋治理，含即時摘要。',
    accessLevel: 'normal',
  },
  homepage: {
    key: 'homepage',
    route: '/admin/homepage',
    title: '首頁內容',
    icon: '📣',
    description: '公開首頁 hero 與區段啟停（全域語意；寫入限 security_admin）。',
    accessLevel: 'normal',
  },
  'scan-overview': {
    key: 'scan-overview',
    route: '/',
    title: '掃描總覽',
    icon: '📡',
    description:
      '公開首頁「掃描總覽」體驗（NEXT_PUBLIC_EXPERIENCE=overview）：頂部 IP 工具列、快速摘要 hero、扣分項與 IP／地理／硬件／瀏覽器／軟體卡。啟停與排序即時影響 `/`。',
    accessLevel: 'normal',
  },
  governance: {
    key: 'governance',
    route: '/admin/governance',
    title: '治理 / 稽核',
    icon: '🛡️',
    description: '稽核串流與角色摘要；整頁 restricted，可見性不可由租戶放寬。',
    accessLevel: 'restricted',
  },
};

const blocks: readonly BlockDef[] = [
  /* ---------- overview ---------- */
  {
    key: 'overview.kpi.summary',
    page: 'overview',
    icon: '📊',
    title: 'KPI 摘要卡',
    description: '評分 / 風險 / 掃描量 / 用量',
    defaultEnabled: true,
    defaultPosition: 0,
    accessLevel: 'normal',
    fields: [
      { kind: 'text', key: 'title', label: '標題', default: '營運總覽', max: 40 },
      {
        kind: 'multiselect',
        key: 'showCards',
        label: '顯示的 KPI 卡',
        default: ['評分', '風險', '掃描量', '用量'],
        options: ['評分', '風險', '掃描量', '用量'],
        maxItems: 4,
      },
    ],
  },
  {
    key: 'overview.trend.week',
    page: 'overview',
    icon: '📈',
    title: '趨勢圖',
    description: '近 N 天指標趨勢',
    defaultEnabled: true,
    defaultPosition: 1,
    accessLevel: 'normal',
    fields: [
      { kind: 'text', key: 'title', label: '標題', default: '近 7 天趨勢', max: 40 },
      { kind: 'number', key: 'days', label: '天數', default: 7, min: 7, max: 90 },
      {
        kind: 'select',
        key: 'metric',
        label: '指標',
        default: '掃描量',
        options: ['掃描量', '風險事件', '平均分'],
      },
    ],
  },
  {
    key: 'overview.recent.incidents',
    page: 'overview',
    icon: '🚨',
    title: '近期高風險',
    description: '依最低 severity 列出',
    defaultEnabled: true,
    defaultPosition: 2,
    accessLevel: 'normal',
    fields: [
      { kind: 'text', key: 'title', label: '標題', default: '近期高風險', max: 40 },
      {
        kind: 'select',
        key: 'minSeverity',
        label: '最低等級',
        default: 'high',
        options: ['info', 'low', 'medium', 'high', 'critical'],
      },
      { kind: 'number', key: 'limit', label: '筆數', default: 5, min: 1, max: 20 },
    ],
  },
  /* ---------- reports ---------- */
  {
    key: 'reports.filters.bar',
    page: 'reports',
    icon: '🔎',
    title: '篩選列',
    description: '風險 / 等級 / 時間窗篩選',
    defaultEnabled: true,
    defaultPosition: 0,
    accessLevel: 'normal',
    fields: [
      { kind: 'toggle', key: 'showRisk', label: '顯示風險篩選', default: true },
      { kind: 'toggle', key: 'showSeverity', label: '顯示等級篩選', default: true },
      {
        kind: 'select',
        key: 'timeWindow',
        label: '預設時間窗',
        default: '7d',
        options: ['24h', '7d', '30d'],
      },
    ],
  },
  {
    key: 'reports.table.list',
    page: 'reports',
    icon: '📄',
    title: '報告列表',
    description: '每頁筆數、欄位與 IP/Raw 遮罩',
    defaultEnabled: true,
    defaultPosition: 1,
    accessLevel: 'normal',
    fields: [
      { kind: 'text', key: 'title', label: '標題', default: '報告', max: 40 },
      { kind: 'number', key: 'pageSize', label: '每頁筆數', default: 20, min: 5, max: 50 },
      {
        kind: 'multiselect',
        key: 'columns',
        label: '顯示欄位',
        default: ['時間', '風險', '分數', 'IP', '來源'],
        options: ['時間', '風險', '分數', 'IP', '來源'],
        maxItems: 5,
      },
      {
        kind: 'toggle',
        key: 'revealRawIp',
        label: '對 security_admin 顯示完整 IP / Raw',
        description: '關＝一律遮罩',
        default: false,
      },
    ],
  },
  {
    key: 'reports.quick.actions',
    page: 'reports',
    icon: '⚡',
    title: '快速處置列',
    description: '列上快速動作按鈕',
    defaultEnabled: true,
    defaultPosition: 2,
    accessLevel: 'normal',
    fields: [
      {
        kind: 'multiselect',
        key: 'actions',
        label: '顯示動作',
        default: ['開複核', '封鎖', '匯出 JSON'],
        options: ['開複核', '封鎖', '匯出 JSON'],
        maxItems: 3,
      },
    ],
  },
  /* ---------- events ---------- */
  {
    key: 'events.filter.chips',
    page: 'events',
    icon: '🏷️',
    title: '事件過濾',
    description: '預設勾選的等級',
    defaultEnabled: true,
    defaultPosition: 0,
    accessLevel: 'normal',
    fields: [
      {
        kind: 'multiselect',
        key: 'defaultSeverity',
        label: '預設等級',
        default: ['medium', 'high', 'critical'],
        options: ['info', 'low', 'medium', 'high', 'critical'],
        maxItems: 5,
      },
    ],
  },
  {
    key: 'events.feed.list',
    page: 'events',
    icon: '📜',
    title: '事件串流',
    description: '事件清單與分組',
    defaultEnabled: true,
    defaultPosition: 1,
    accessLevel: 'normal',
    fields: [
      { kind: 'text', key: 'title', label: '標題', default: '風險事件', max: 40 },
      { kind: 'number', key: 'limit', label: '筆數', default: 20, min: 5, max: 100 },
      { kind: 'toggle', key: 'groupByReport', label: '依報告分組', default: false },
    ],
  },
  {
    key: 'events.summary.badge',
    page: 'events',
    icon: '🔢',
    title: '事件統計',
    description: '事件數與自動處置摘要',
    defaultEnabled: true,
    defaultPosition: 2,
    accessLevel: 'normal',
    fields: [
      { kind: 'text', key: 'title', label: '標題', default: '事件統計', max: 40 },
      { kind: 'toggle', key: 'showAutoBlock', label: '顯示自動封鎖數', default: true },
    ],
  },
  /* ---------- devices ---------- */
  {
    key: 'devices.stats.card',
    page: 'devices',
    icon: '🧬',
    title: '設備統計',
    description: '設備數 / 跨 session / IP 數',
    defaultEnabled: true,
    defaultPosition: 0,
    accessLevel: 'normal',
    fields: [
      { kind: 'text', key: 'title', label: '標題', default: '設備指紋', max: 40 },
      {
        kind: 'multiselect',
        key: 'cards',
        label: '顯示卡片',
        default: ['設備數', '跨 session 數', 'IP 數'],
        options: ['設備數', '跨 session 數', 'IP 數'],
        maxItems: 3,
      },
    ],
  },
  {
    key: 'devices.table.list',
    page: 'devices',
    icon: '🖥️',
    title: '設備清單',
    description: '依租戶列 device_fingerprints（預設停用，可自行啟用）',
    defaultEnabled: false,
    defaultPosition: 1,
    accessLevel: 'normal',
    fields: [
      { kind: 'text', key: 'title', label: '標題', default: '設備', max: 40 },
      { kind: 'number', key: 'pageSize', label: '每頁筆數', default: 20, min: 5, max: 50 },
      {
        kind: 'toggle',
        key: 'revealHash',
        label: '對 security_admin 顯示完整 hash',
        default: false,
      },
    ],
  },
  /* ---------- workbench（管理者工作台 6+1 分類卡） ---------- */
  {
    key: 'workbench.decision',
    page: 'workbench',
    icon: '⚖️',
    title: '決策樞紐與快速處置',
    description: '評分/等級/建議動作；即時摘要＝最近報告與複核佇列。',
    defaultEnabled: true,
    defaultPosition: 0,
    accessLevel: 'normal',
    fields: [
      { kind: 'text', key: 'title', label: '標題', default: '決策樞紐', max: 40 },
      { kind: 'number', key: 'limit', label: '摘要筆數', default: 4, min: 2, max: 10 },
      { kind: 'toggle', key: 'showSummary', label: '顯示即時摘要', default: true },
    ],
  },
  {
    key: 'workbench.risk',
    page: 'workbench',
    icon: '🚨',
    title: '異常與一致性矩陣',
    description: 'OS/端口/DNS/WebRTC/Canvas 衝突；即時摘要＝最新風險事件。',
    defaultEnabled: true,
    defaultPosition: 1,
    accessLevel: 'normal',
    fields: [
      { kind: 'text', key: 'title', label: '標題', default: '異常矩陣', max: 40 },
      { kind: 'number', key: 'limit', label: '摘要筆數', default: 4, min: 2, max: 10 },
      { kind: 'toggle', key: 'showSummary', label: '顯示即時摘要', default: true },
    ],
  },
  {
    key: 'workbench.network',
    page: 'workbench',
    icon: '🌐',
    title: '網路、IP 與地理',
    description: 'IP/ISP/WebRTC/DNS/開放埠/地理；即時摘要＝最近報告的網路分析。',
    defaultEnabled: true,
    defaultPosition: 2,
    accessLevel: 'normal',
    fields: [
      { kind: 'text', key: 'title', label: '標題', default: '網路地理', max: 40 },
      { kind: 'number', key: 'limit', label: '摘要筆數', default: 3, min: 2, max: 10 },
      { kind: 'toggle', key: 'showSummary', label: '顯示即時摘要', default: true },
    ],
  },
  {
    key: 'workbench.hardware',
    page: 'workbench',
    icon: '🧬',
    title: '硬體與設備指紋',
    description: 'GPU/CPU/螢幕與 Canvas/WebGL/Audio/Fonts 指紋；即時摘要＝最近報告指紋鍵。',
    defaultEnabled: true,
    defaultPosition: 3,
    accessLevel: 'normal',
    fields: [
      { kind: 'text', key: 'title', label: '標題', default: '硬體指紋', max: 40 },
      { kind: 'number', key: 'limit', label: '摘要筆數', default: 3, min: 2, max: 10 },
      { kind: 'toggle', key: 'showSummary', label: '顯示即時摘要', default: true },
    ],
  },
  {
    key: 'workbench.browser',
    page: 'workbench',
    icon: '🖥️',
    title: '瀏覽器與軟體環境',
    description: 'UA/OS/瀏覽器/用戶端提示；即時摘要＝最近報告環境欄位。',
    defaultEnabled: true,
    defaultPosition: 4,
    accessLevel: 'normal',
    fields: [
      { kind: 'text', key: 'title', label: '標題', default: '瀏覽器環境', max: 40 },
      { kind: 'number', key: 'limit', label: '摘要筆數', default: 3, min: 2, max: 10 },
      { kind: 'toggle', key: 'showSummary', label: '顯示即時摘要', default: true },
    ],
  },
  {
    key: 'workbench.raw',
    page: 'workbench',
    icon: '🗃️',
    title: '原始與稽核',
    description: 'Raw JSON/訊號/問題清單；即時摘要＝最近報告統計。',
    defaultEnabled: true,
    defaultPosition: 5,
    accessLevel: 'normal',
    fields: [
      { kind: 'text', key: 'title', label: '標題', default: '原始與稽核', max: 40 },
      { kind: 'number', key: 'limit', label: '摘要筆數', default: 3, min: 2, max: 10 },
      { kind: 'toggle', key: 'showSummary', label: '顯示即時摘要', default: true },
    ],
  },
  {
    key: 'workbench.governance',
    page: 'workbench',
    icon: '🛡️',
    title: '治理（RBAC/稽核/保留）',
    description: '稽核串流與角色；即時摘要＝最近稽核動作。',
    defaultEnabled: true,
    defaultPosition: 6,
    accessLevel: 'restricted',
    fields: [
      { kind: 'text', key: 'title', label: '標題', default: '治理', max: 40 },
      { kind: 'number', key: 'limit', label: '摘要筆數', default: 4, min: 2, max: 10 },
      { kind: 'toggle', key: 'showSummary', label: '顯示即時摘要', default: true },
    ],
  },
  /* ---------- homepage ---------- */
  {
    key: 'homepage.hero',
    page: 'homepage',
    icon: '📣',
    title: '主視覺區（hero）',
    description: '公開首頁主視覺；全域語意、寫入限 security_admin',
    defaultEnabled: true,
    defaultPosition: 0,
    accessLevel: 'normal',
    fields: [
      { kind: 'text', key: 'title', label: '主標題', default: 'ShieldScan 隱盾檢測', max: 80 },
      { kind: 'text', key: 'subtitle', label: '副標', default: '隱私威脅即時偵測', max: 160 },
      { kind: 'text', key: 'ctaText', label: '按鈕文字', default: '開始掃描', max: 20 },
      { kind: 'color', key: 'accentColor', label: '主色', default: '#4da3ff' },
    ],
  },
  {
    key: 'homepage.sections',
    page: 'homepage',
    icon: '🧩',
    title: '頁面區段啟停',
    description: '公開首頁各區段顯隱',
    defaultEnabled: true,
    defaultPosition: 1,
    accessLevel: 'normal',
    fields: [
      { kind: 'toggle', key: 'showConsent', label: '顯示同意橫幅', default: true },
      { kind: 'toggle', key: 'showFeatures', label: '顯示功能介紹', default: true },
      { kind: 'toggle', key: 'showFooter', label: '顯示頁尾', default: true },
    ],
  },
  /* ---------- scan-overview（公開「掃描總覽」首頁，NEXT_PUBLIC_EXPERIENCE=overview） ----------
   * home-overview-v2.tsx 依此頁版面（order/disabled）渲染。
   * 註：ov.score（評分卡／真實度）不獨立成塊——hero 已內含隱私評分大數字與瀏覽器指紋
   * 真實度（見 home-overview-v2 的 ov-hero-score）；因此併入 ov.hero。
   * fields 留空：本頁區塊僅支援「啟停＋排序」，不做欄位參數覆寫。
   */
  {
    key: 'ov.toolbar',
    page: 'scan-overview',
    icon: '📍',
    title: '頂部 IP 工具列',
    description: 'sticky 工具列：目前 IP、地理位置、複製與重新掃描。',
    defaultEnabled: true,
    defaultPosition: 0,
    accessLevel: 'normal',
    fields: [],
  },
  {
    key: 'ov.hero',
    page: 'scan-overview',
    icon: '🛡️',
    title: '快速摘要＋隱私評分',
    description: '兩欄快速摘要（IP／地理／瀏覽器…）＋隱私評分大數字、真實度與等級徽章。',
    defaultEnabled: true,
    defaultPosition: 1,
    accessLevel: 'normal',
    fields: [],
  },
  {
    key: 'ov.issues',
    page: 'scan-overview',
    icon: '📉',
    title: '扣分項分析 Issues',
    description: '規則與訊號扣分項（名稱／說明／證據）。',
    defaultEnabled: true,
    defaultPosition: 2,
    accessLevel: 'normal',
    fields: [],
  },
  {
    key: 'ov.ip',
    page: 'scan-overview',
    icon: '🌐',
    title: 'IP 地址卡',
    description: 'IP／WebRTC／STUN／IP 計數／ISP 欄位。',
    defaultEnabled: true,
    defaultPosition: 3,
    accessLevel: 'normal',
    fields: [],
  },
  {
    key: 'ov.location',
    page: 'scan-overview',
    icon: '🗺️',
    title: '地理位置卡',
    description: '國家／州省／城市／郵遞區號／經緯度欄位。',
    defaultEnabled: true,
    defaultPosition: 4,
    accessLevel: 'normal',
    fields: [],
  },
  {
    key: 'ov.hardware',
    page: 'scan-overview',
    icon: '🖥️',
    title: '硬件卡',
    description: '訪客 ID／Canvas／WebGL／Audio／螢幕／設備記憶體欄位。',
    defaultEnabled: true,
    defaultPosition: 5,
    accessLevel: 'normal',
    fields: [],
  },
  {
    key: 'ov.browser',
    page: 'scan-overview',
    icon: '🧬',
    title: '瀏覽器卡',
    description: 'OS／瀏覽器名稱／版本／Header／JavaScript 欄位。',
    defaultEnabled: true,
    defaultPosition: 6,
    accessLevel: 'normal',
    fields: [],
  },
  {
    key: 'ov.software',
    page: 'scan-overview',
    icon: '🧩',
    title: '軟件卡',
    description: '時區／語言／DNT／Cookie／端口與外掛偵測欄位。',
    defaultEnabled: true,
    defaultPosition: 7,
    accessLevel: 'normal',
    fields: [],
  },
  /* ---------- governance（restricted） ---------- */
  {
    key: 'governance.audit.trail',
    page: 'governance',
    icon: '🛡️',
    title: '稽核串流',
    description: 'audit_logs（僅 security_admin）',
    defaultEnabled: true,
    defaultPosition: 0,
    accessLevel: 'restricted',
    fields: [
      { kind: 'text', key: 'title', label: '標題', default: '稽核日誌', max: 40 },
      { kind: 'number', key: 'limit', label: '筆數', default: 50, min: 10, max: 200 },
    ],
  },
  {
    key: 'governance.roles.info',
    page: 'governance',
    icon: '👥',
    title: '角色摘要',
    description: '唯讀角色/權限說明',
    defaultEnabled: true,
    defaultPosition: 1,
    accessLevel: 'restricted',
    fields: [
      { kind: 'text', key: 'title', label: '標題', default: '角色與權限', max: 40 },
    ],
  },
];

export const BLOCK_REGISTRY: Record<string, BlockDef> = Object.fromEntries(
  blocks.map((b) => [b.key, b]),
);

/** 依頁面列出區塊（依 defaultPosition 排序）。 */
export function listPageBlocks(page: AdminPageKey): BlockDef[] {
  return blocks.filter((b) => b.page === page).sort((a, b) => a.defaultPosition - b.defaultPosition);
}

/** 全部區塊（依頁面＋位置）。 */
export function listAllBlocks(): BlockDef[] {
  return ADMIN_PAGE_KEYS.flatMap((p) => listPageBlocks(p));
}
