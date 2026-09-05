import type {
  EnvironmentReport,
  FieldDefinition,
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
}
