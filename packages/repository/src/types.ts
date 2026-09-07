import type {
  AppealCase,
  EnvironmentReport,
  FieldDefinition,
  PolicyDecision,
  ReviewCase,
  ReviewStatus,
  RiskEvent,
  RiskEventType,
  Severity,
} from '@shieldscan/core-schema';

export interface VisitorProfile {
  visitorId: string;
  hardwareHash?: string;
  canvasHash?: string;
  webglHash?: string;
  webgpuHash?: string;
  audioHash?: string;
  deviceType?: string;
  osFamily?: string;
  browserFamily?: string;
  firstSeen?: string;
  lastSeen?: string;
  scanCount: number;
  ipHistory: string[];
}

export interface ReportMeta {
  clientIp?: string;
  privacyScore?: number;
  grade?: string;
  riskLevel?: string;
  retentionDays?: number;
  /** 伺服器計算的設備指紋 hash（同裝置跨 session 聚合/IP 速度用）。 */
  fingerprintHash?: string;
}

export interface StoredReport extends EnvironmentReport {
  clientIp?: string;
  privacyScore?: number;
  grade?: string;
  riskLevel?: string;
}

export interface ReportRepository {
  saveReport(report: EnvironmentReport, meta?: ReportMeta): Promise<void>;
  /** 讀取單筆報告（限 tenantId 所屬；匿名 NULL 資料不可見）。 */
  getReport(tenantId: string, reportId: string): Promise<StoredReport | null>;
  countReports(tenantId?: string): Promise<number>;
  listReportsByTenant(tenantId: string, limit?: number): Promise<StoredReport[]>;
  listReportsByVisitor(tenantId: string, visitorId: string, limit?: number): Promise<StoredReport[]>;
  upsertVisitor(visitorId: string, profile: VisitorProfile): Promise<void>;
  getVisitor(tenantId: string, visitorId: string): Promise<VisitorProfile | null>;
  /** 刪除單筆報告（GDPR/個資刪除請求）。回傳是否真的刪除了資料。 */
  deleteReport(tenantId: string, reportId: string): Promise<boolean>;
  /** 刪除訪客及其全部報告（被遺忘權）。回傳是否真的刪除了資料。 */
  deleteVisitor(tenantId: string, visitorId: string): Promise<boolean>;
  /** 保留期清理：刪除 expires_at 早於 before 的報告（平台層 job 用）。回傳刪除筆數。 */
  deleteExpiredReports(before: string): Promise<number>;
  /** 某裝置指紋在時窗內使用過的不同 client IP（IP 速度偵測用；限 tenant）。 */
  listRecentClientIps(
    tenantId: string,
    fingerprintHash: string,
    since: string,
    limit?: number,
  ): Promise<string[]>;
  /** M2 圖譜：某裝置指紋的 session 明細（session/IP/訪客/時間；限 tenant）。 */
  listSessionsByFingerprint(
    tenantId: string,
    fingerprintHash: string,
    since: string,
    limit?: number,
  ): Promise<DeviceSessionRow[]>;
  /** M2 圖譜：某 IP 在時窗內出現過的裝置指紋（含 session 數/最後時間；限 tenant）。 */
  listFingerprintsByIp(
    tenantId: string,
    ip: string,
    since: string,
    limit?: number,
  ): Promise<FingerprintByIpRow[]>;
}

/** M2 圖譜：單一 session 與裝置/IP 的邊。 */
export interface DeviceSessionRow {
  sessionId: string;
  reportId?: string;
  visitorId: string;
  clientIp?: string;
  createdAt: string;
}

/** M2 圖譜：裝置 ↔ IP 的邊（聚合）。 */
export interface FingerprintByIpRow {
  fingerprintHash: string;
  sessionCount: number;
  lastSeen: string;
}

export interface RiskEventFilter {
  sessionId?: string;
  severity?: Severity;
  eventType?: RiskEventType;
  limit?: number;
}

/** Phase 1：設備指紋（跨 session 聚類用，對應 device_fingerprints）。 */
export interface DeviceFingerprint {
  fingerprintHash: string;
  tenantId?: string;
  canvasHash?: string;
  webglHash?: string;
  webgpuHash?: string;
  audioHash?: string;
  fontsHash?: string;
  clientRectsHash?: string;
  unmaskedVendor?: string;
  unmaskedRenderer?: string;
  screenSignature?: string;
  hardwareSignature?: string;
  firstSeen?: string;
  lastSeen?: string;
  sessionCount: number;
  ipCount: number;
  stabilityScore?: number;
  entropyScore?: number;
  retentionUntil?: string;
}

/** Phase 1：結構化網路訊號（對應 network_signals）。 */
export interface NetworkSignal {
  sessionId: string;
  reportId?: string;
  tenantId?: string;
  ipAddress?: string;
  ipConfidence?: 'low' | 'medium' | 'high';
  isp?: string;
  asn?: string;
  networkType?: string;
  ipHistory7d?: number;
  ipHistory30d?: number;
  proxyDetected?: boolean;
  vpnDetected?: boolean;
  torDetected?: boolean;
  webrtcIp?: string;
  webrtcStunIp?: string;
  webrtcMismatch?: boolean;
  dnsLeakStatus?: string;
  dnsLeakList?: string[];
  openPorts?: number[];
  country?: string;
  region?: string;
  city?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  geoConfidence?: 'low' | 'medium' | 'high';
  timezoneIp?: string;
  timezoneJs?: string;
  timeConsistency?: boolean;
}

export interface ReviewCaseFilter {
  status?: ReviewStatus;
  limit?: number;
}

export interface ReviewCasePatch {
  status?: ReviewStatus;
  decision?: PolicyDecision;
  reason?: string;
  reviewerId?: string;
  falsePositiveFlag?: boolean;
  closedAt?: string;
}

export interface AuditLogEntry {
  action: string;
  tenantId?: string;
  targetIp?: string;
  actorIp?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

/** 決策成效回饋的事件型別（WP3：Shadow/ROI 的數據來源）。 */
export type OutcomeType =
  | 'fraud_chargeback'
  | 'fraud_order'
  | 'false_positive'
  | 'appeal_accepted'
  | 'appeal_rejected'
  | 'decision_log';

/** 成效回饋事件：把「當時的決策/Shadow 反事實」與「事後結果」接起來。 */
export interface OutcomeEntry {
  id: string;
  tenantId?: string;
  reportId?: string;
  caseId?: string;
  sessionId?: string;
  outcomeType: OutcomeType;
  /** 決策/反事實決策（enforced 時為實際決策；shadow 時為 would_action）。 */
  decision?: PolicyDecision;
  shadow?: boolean;
  amount?: number;
  occurredAt: string;
  metadata?: Record<string, unknown>;
}

export interface IpReputation {
  ipRange: string;
  reputationScore: number;
  categories: string[];
  source?: string;
  lastSeen?: string;
}

/**
 * Phase 1 查詢層：風險事件與欄位定義（Schema Registry 雛形）。
 * 對應 risk_events / field_definitions 資料表。
 */
export interface RiskRepository {
  insertRiskEvent(event: RiskEvent): Promise<void>;
  insertRiskEvents(events: RiskEvent[]): Promise<void>;
  /** 風險事件列表：一律以 tenantId 過濾（租戶只能看自己的事件）。 */
  listRiskEvents(tenantId: string, filter?: RiskEventFilter): Promise<RiskEvent[]>;
  upsertFieldDefinition(definition: FieldDefinition): Promise<void>;
  listFieldDefinitions(limit?: number): Promise<FieldDefinition[]>;
  upsertDeviceFingerprint(device: DeviceFingerprint): Promise<void>;
  getDeviceFingerprint(fingerprintHash: string): Promise<DeviceFingerprint | null>;
  listDeviceFingerprints(tenantId: string, limit?: number): Promise<DeviceFingerprint[]>;
  upsertNetworkSignal(signal: NetworkSignal): Promise<void>;
  getNetworkSignal(sessionId: string): Promise<NetworkSignal | null>;
  createReviewCase(caseData: ReviewCase): Promise<void>;
  listReviewCases(tenantId: string, filter?: ReviewCaseFilter): Promise<ReviewCase[]>;
  getReviewCase(tenantId: string, caseId: string): Promise<ReviewCase | null>;
  updateReviewCase(tenantId: string, caseId: string, patch: ReviewCasePatch): Promise<ReviewCase | null>;
  createAppeal(appeal: AppealCase): Promise<void>;
  appendAuditLog(entry: AuditLogEntry): Promise<void>;
  listAuditLogs(tenantId: string, limit?: number): Promise<AuditLogEntry[]>;
  /** 記錄成效回饋事件（tenant 隔離）。 */
  recordOutcome(entry: OutcomeEntry): Promise<void>;
  listOutcomes(
    tenantId: string,
    since?: string,
    until?: string,
    limit?: number,
  ): Promise<OutcomeEntry[]>;
  getIpReputation(ip: string): Promise<IpReputation | null>;
  upsertIpReputation(reputation: IpReputation): Promise<void>;
  getSiteConfig(key: string): Promise<unknown | null>;
  setSiteConfig(key: string, payload: unknown): Promise<void>;
}
