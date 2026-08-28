import type { EnvironmentReport } from '@shieldscan/core-schema';

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
}
