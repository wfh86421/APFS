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
}

export interface StoredReport extends EnvironmentReport {
  clientIp?: string;
  privacyScore?: number;
  grade?: string;
  riskLevel?: string;
}

export interface ReportRepository {
  saveReport(report: EnvironmentReport, meta?: ReportMeta): Promise<void>;
  getReport(reportId: string): Promise<StoredReport | null>;
  listReportsByVisitor(visitorId: string, limit?: number): Promise<StoredReport[]>;
  upsertVisitor(visitorId: string, profile: VisitorProfile): Promise<void>;
  getVisitor(visitorId: string): Promise<VisitorProfile | null>;
  /** 刪除單筆報告（GDPR/個資刪除請求）。回傳是否真的刪除了資料。 */
  deleteReport(reportId: string): Promise<boolean>;
  /** 刪除訪客及其全部報告（被遺忘權）。回傳是否真的刪除了資料。 */
  deleteVisitor(visitorId: string): Promise<boolean>;
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

/**
 * Phase 1 查詢層：風險事件與欄位定義（Schema Registry 雛形）。
 * 對應 risk_events / field_definitions 資料表。
 */
export interface RiskRepository {
  insertRiskEvent(event: RiskEvent): Promise<void>;
  insertRiskEvents(events: RiskEvent[]): Promise<void>;
  listRiskEvents(filter?: RiskEventFilter): Promise<RiskEvent[]>;
  upsertFieldDefinition(definition: FieldDefinition): Promise<void>;
  listFieldDefinitions(limit?: number): Promise<FieldDefinition[]>;
  upsertDeviceFingerprint(device: DeviceFingerprint): Promise<void>;
  getDeviceFingerprint(fingerprintHash: string): Promise<DeviceFingerprint | null>;
  listDeviceFingerprints(limit?: number): Promise<DeviceFingerprint[]>;
  upsertNetworkSignal(signal: NetworkSignal): Promise<void>;
  getNetworkSignal(sessionId: string): Promise<NetworkSignal | null>;
  createReviewCase(caseData: ReviewCase): Promise<void>;
  listReviewCases(filter?: ReviewCaseFilter): Promise<ReviewCase[]>;
  getReviewCase(caseId: string): Promise<ReviewCase | null>;
  updateReviewCase(caseId: string, patch: ReviewCasePatch): Promise<ReviewCase | null>;
  createAppeal(appeal: AppealCase): Promise<void>;
}
