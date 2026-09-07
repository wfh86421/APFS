import type {
  AppealCase,
  EnvironmentReport,
  FieldDefinition,
  ReviewCase,
  RiskEvent,
} from '@shieldscan/core-schema';
import type {
  AuditLogEntry,
  DeviceFingerprint,
  IpReputation,
  NetworkSignal,
  OutcomeEntry,
  ReportMeta,
  ReportRepository,
  ReviewCasePatch,
  RiskEventFilter,
  RiskRepository,
  StoredReport,
  VisitorProfile,
} from './types.js';

/**
 * 記憶體實作：開發、測試與沒有資料庫的環境使用。
 * 重啟後資料消失，正式環境請改用 PostgresReportRepository。
 */
export class InMemoryReportRepository implements ReportRepository {
  private readonly reports = new Map<string, StoredReport>();
  private readonly visitors = new Map<string, VisitorProfile>();
  private readonly fingerprints = new Map<string, string>();

  async saveReport(report: EnvironmentReport, meta?: ReportMeta): Promise<void> {
    this.reports.set(report.reportId, {
      ...report,
      clientIp: meta?.clientIp,
      privacyScore: meta?.privacyScore,
      grade: meta?.grade,
      riskLevel: meta?.riskLevel,
    });
    if (meta?.fingerprintHash) this.fingerprints.set(report.reportId, meta.fingerprintHash);

    const existing = this.visitors.get(report.subjectId ?? report.sessionId);
    if (existing) {
      existing.lastSeen = report.createdAt;
      existing.scanCount += 1;
      if (meta?.clientIp && !existing.ipHistory.includes(meta.clientIp)) {
        existing.ipHistory.push(meta.clientIp);
      }
    }
  }

  async getReport(tenantId: string, reportId: string): Promise<StoredReport | null> {
    const report = this.reports.get(reportId);
    return report && report.tenantId === tenantId ? report : null;
  }

  async countReports(tenantId?: string): Promise<number> {
    return tenantId
      ? [...this.reports.values()].filter((report) => report.tenantId === tenantId).length
      : this.reports.size;
  }

  async listReportsByTenant(tenantId: string, limit = 20): Promise<StoredReport[]> {
    return [...this.reports.values()]
      .filter((report) => report.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async listReportsByVisitor(
    tenantId: string,
    visitorId: string,
    limit = 20,
  ): Promise<StoredReport[]> {
    return [...this.reports.values()]
      .filter(
        (r) => r.tenantId === tenantId && (r.subjectId === visitorId || r.sessionId === visitorId),
      )
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

  async getVisitor(tenantId: string, visitorId: string): Promise<VisitorProfile | null> {
    const hasReport = [...this.reports.values()].some(
      (r) => r.tenantId === tenantId && (r.subjectId === visitorId || r.sessionId === visitorId),
    );
    if (!hasReport) return null;
    return this.visitors.get(visitorId) ?? null;
  }

  async deleteReport(tenantId: string, reportId: string): Promise<boolean> {
    const report = this.reports.get(reportId);
    if (!report || report.tenantId !== tenantId) return false;
    this.fingerprints.delete(reportId);
    return this.reports.delete(reportId);
  }

  async listRecentClientIps(
    tenantId: string,
    fingerprintHash: string,
    since: string,
    limit = 100,
  ): Promise<string[]> {
    const ips = new Set<string>();
    for (const [reportId, report] of this.reports) {
      if (ips.size >= limit) break;
      if (
        report.tenantId === tenantId &&
        this.fingerprints.get(reportId) === fingerprintHash &&
        report.createdAt >= since &&
        report.clientIp
      ) {
        ips.add(report.clientIp);
      }
    }
    return [...ips].sort();
  }

  async deleteExpiredReports(before: string): Promise<number> {
    let removed = 0;
    for (const [id, report] of this.reports) {
      const days = report.consent?.retentionDays;
      if (!days || days <= 0) continue;
      const expiresAt = new Date(new Date(report.createdAt).getTime() + days * 86_400_000);
      if (expiresAt.toISOString() < before) {
        this.reports.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  async deleteVisitor(tenantId: string, visitorId: string): Promise<boolean> {
    let removed = false;
    for (const [id, report] of this.reports) {
      if (
        report.tenantId === tenantId &&
        (report.subjectId === visitorId || report.sessionId === visitorId)
      ) {
        this.reports.delete(id);
        removed = true;
      }
    }
    const stillReferenced = [...this.reports.values()].some(
      (r) => r.subjectId === visitorId || r.sessionId === visitorId,
    );
    if (!stillReferenced) {
      const existed = this.visitors.delete(visitorId);
      removed = removed || existed;
    }
    return removed;
  }
}

/** Phase 1：InMemory 風險事件／欄位定義（與 Postgres 行為一致）。 */
export class InMemoryRiskRepository implements RiskRepository {
  private readonly events = new Map<string, RiskEvent>();
  private readonly definitions = new Map<string, FieldDefinition>();
  private readonly devices = new Map<string, DeviceFingerprint>();
  private readonly networkSignals = new Map<string, NetworkSignal>();
  private readonly reviewCases = new Map<string, ReviewCase>();
  private readonly appeals = new Map<string, AppealCase>();
  private readonly auditLogs: AuditLogEntry[] = [];
  private readonly outcomes: OutcomeEntry[] = [];
  private readonly ipReputations = new Map<string, IpReputation>();
  private readonly siteConfigs = new Map<string, unknown>();

  async insertRiskEvent(event: RiskEvent): Promise<void> {
    this.events.set(event.eventId, event);
  }

  async insertRiskEvents(events: RiskEvent[]): Promise<void> {
    for (const event of events) await this.insertRiskEvent(event);
  }

  async listRiskEvents(tenantId: string, filter: RiskEventFilter = {}): Promise<RiskEvent[]> {
    const limit = filter.limit ?? 100;
    return [...this.events.values()]
      .filter(
        (event) =>
          event.tenantId === tenantId &&
          (!filter.sessionId || event.sessionId === filter.sessionId) &&
          (!filter.severity || event.severity === filter.severity) &&
          (!filter.eventType || event.eventType === filter.eventType),
      )
      .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
      .slice(0, limit);
  }

  async upsertFieldDefinition(definition: FieldDefinition): Promise<void> {
    this.definitions.set(definition.fieldPath, definition);
  }

  async listFieldDefinitions(limit = 500): Promise<FieldDefinition[]> {
    return [...this.definitions.values()].slice(0, limit);
  }

  async upsertDeviceFingerprint(device: DeviceFingerprint): Promise<void> {
    const existing = this.devices.get(device.fingerprintHash);
    if (!existing) {
      this.devices.set(device.fingerprintHash, device);
      return;
    }
    this.devices.set(device.fingerprintHash, {
      ...existing,
      ...device,
      sessionCount: existing.sessionCount + device.sessionCount,
      ipCount: existing.ipCount + device.ipCount,
      lastSeen: device.lastSeen ?? existing.lastSeen,
    });
  }

  async getDeviceFingerprint(fingerprintHash: string): Promise<DeviceFingerprint | null> {
    return this.devices.get(fingerprintHash) ?? null;
  }

  async listDeviceFingerprints(tenantId: string, limit = 100): Promise<DeviceFingerprint[]> {
    return [...this.devices.values()]
      .filter((device) => device.tenantId === tenantId)
      .sort((a, b) => (b.lastSeen ?? '').localeCompare(a.lastSeen ?? ''))
      .slice(0, limit);
  }

  async upsertNetworkSignal(signal: NetworkSignal): Promise<void> {
    const existing = this.networkSignals.get(signal.sessionId);
    this.networkSignals.set(signal.sessionId, { ...existing, ...signal });
  }

  async getNetworkSignal(sessionId: string): Promise<NetworkSignal | null> {
    return this.networkSignals.get(sessionId) ?? null;
  }

  async createReviewCase(caseData: ReviewCase): Promise<void> {
    this.reviewCases.set(caseData.caseId, caseData);
  }

  async listReviewCases(
    tenantId: string,
    filter: { status?: string; limit?: number } = {},
  ): Promise<ReviewCase[]> {
    const { status, limit } = filter;
    return [...this.reviewCases.values()]
      .filter((item) => item.tenantId === tenantId && (!status || item.status === status))
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
      .slice(0, limit ?? 100);
  }

  async getReviewCase(tenantId: string, caseId: string): Promise<ReviewCase | null> {
    const reviewCase = this.reviewCases.get(caseId);
    return reviewCase && reviewCase.tenantId === tenantId ? reviewCase : null;
  }

  async updateReviewCase(
    tenantId: string,
    caseId: string,
    patch: ReviewCasePatch,
  ): Promise<ReviewCase | null> {
    const current = this.reviewCases.get(caseId);
    if (!current || current.tenantId !== tenantId) return null;
    const next: ReviewCase = { ...current, ...patch };
    this.reviewCases.set(caseId, next);
    return next;
  }

  async createAppeal(appeal: AppealCase): Promise<void> {
    this.appeals.set(appeal.appealId, appeal);
    const reviewCase = this.reviewCases.get(appeal.caseId);
    if (reviewCase && reviewCase.appealStatus === 'none') {
      this.reviewCases.set(appeal.caseId, { ...reviewCase, appealStatus: 'pending' });
    }
  }

  async appendAuditLog(entry: AuditLogEntry): Promise<void> {
    this.auditLogs.unshift({ ...entry, createdAt: entry.createdAt ?? new Date().toISOString() });
  }

  async listAuditLogs(tenantId: string, limit = 100): Promise<AuditLogEntry[]> {
    return this.auditLogs.filter((entry) => entry.tenantId === tenantId).slice(0, limit);
  }

  async recordOutcome(entry: OutcomeEntry): Promise<void> {
    this.outcomes.push(entry);
  }

  async listOutcomes(
    tenantId: string,
    since?: string,
    until?: string,
    limit = 500,
  ): Promise<OutcomeEntry[]> {
    return this.outcomes
      .filter(
        (entry) =>
          entry.tenantId === tenantId &&
          (!since || entry.occurredAt >= since) &&
          (!until || entry.occurredAt <= until),
      )
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, limit);
  }

  async getIpReputation(ip: string): Promise<IpReputation | null> {
    return this.ipReputations.get(ip) ?? null;
  }

  async upsertIpReputation(reputation: IpReputation): Promise<void> {
    this.ipReputations.set(reputation.ipRange, {
      ...reputation,
      lastSeen: reputation.lastSeen ?? new Date().toISOString(),
    });
  }

  async getSiteConfig(key: string): Promise<unknown | null> {
    return this.siteConfigs.get(key) ?? null;
  }

  async setSiteConfig(key: string, payload: unknown): Promise<void> {
    this.siteConfigs.set(key, payload);
  }
}
