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
    const existing = this.visitors.get(visitorId);
    if (!existing) {
      this.visitors.set(visitorId, profile);
      return;
    }
    // 合併而非覆寫：累積 IP 歷史與掃描次數（與 Postgres 版行為一致）。
    existing.lastSeen = profile.lastSeen ?? existing.lastSeen;
    existing.scanCount += profile.scanCount;
    for (const ip of profile.ipHistory) {
      if (!existing.ipHistory.includes(ip)) existing.ipHistory.push(ip);
    }
    existing.hardwareHash = profile.hardwareHash ?? existing.hardwareHash;
    existing.canvasHash = profile.canvasHash ?? existing.canvasHash;
    existing.webglHash = profile.webglHash ?? existing.webglHash;
    existing.webgpuHash = profile.webgpuHash ?? existing.webgpuHash;
    existing.audioHash = profile.audioHash ?? existing.audioHash;
  }

  async getVisitor(visitorId: string): Promise<VisitorProfile | null> {
    return this.visitors.get(visitorId) ?? null;
  }

  async deleteReport(reportId: string): Promise<boolean> {
    return this.reports.delete(reportId);
  }

  async deleteVisitor(visitorId: string): Promise<boolean> {
    const existed = this.visitors.delete(visitorId);
    for (const [id, report] of this.reports) {
      if (report.subjectId === visitorId || report.sessionId === visitorId) {
        this.reports.delete(id);
      }
    }
    return existed;
  }
}
