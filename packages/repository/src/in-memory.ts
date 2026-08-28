import type { EnvironmentReport } from '@shieldscan/core-schema';
import type { ReportMeta, ReportRepository, StoredReport, VisitorProfile } from './types.js';

/**
 * 記憶體實作：開發、測試與沒有資料庫的環境使用。
 * 重啟後資料消失，正式環境請改用 PostgresReportRepository。
 */
export class InMemoryReportRepository implements ReportRepository {
  private readonly reports = new Map<string, StoredReport>();
  private readonly visitors = new Map<string, VisitorProfile>();

  async saveReport(report: EnvironmentReport, meta?: ReportMeta): Promise<void> {
    this.reports.set(report.reportId, {
      ...report,
      clientIp: meta?.clientIp,
      privacyScore: meta?.privacyScore,
      grade: meta?.grade,
      riskLevel: meta?.riskLevel,
    });

    const existing = this.visitors.get(report.subjectId ?? report.sessionId);
    if (existing) {
      existing.lastSeen = report.createdAt;
      existing.scanCount += 1;
      if (meta?.clientIp && !existing.ipHistory.includes(meta.clientIp)) {
        existing.ipHistory.push(meta.clientIp);
      }
    }
  }

  async getReport(reportId: string): Promise<StoredReport | null> {
    return this.reports.get(reportId) ?? null;
  }

  async listReportsByVisitor(visitorId: string, limit = 20): Promise<StoredReport[]> {
    return [...this.reports.values()]
      .filter((r) => r.subjectId === visitorId || r.sessionId === visitorId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async upsertVisitor(visitorId: string, profile: VisitorProfile): Promise<void> {
    this.visitors.set(visitorId, profile);
  }

  async getVisitor(visitorId: string): Promise<VisitorProfile | null> {
    return this.visitors.get(visitorId) ?? null;
  }
}
