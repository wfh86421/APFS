import pg from 'pg';
import type { EnvironmentReport } from '@shieldscan/core-schema';
import type {
  DeviceSessionRow,
  FingerprintByIpRow,
  ReportMeta,
  ReportRepository,
  StoredReport,
  VisitorProfile,
} from './types.js';

const { Pool } = pg;

interface ScanRow {
  report_id: string;
  tenant_id: string | null;
  schema_version: string;
  visitor_id: string;
  session_id: string;
  source: string;
  consent_mode: string;
  retention_days: number | null;
  sdk_name: string;
  sdk_version: string;
  client_ip: string | null;
  privacy_score: number | null;
  grade: string | null;
  risk_level: string | null;
  signals: unknown;
  issues: unknown;
  scores: unknown;
  integrity: unknown;
  raw: unknown;
  created_at: string;
  subject_id: string | null;
}

interface VisitorRow {
  visitor_id: string;
  hardware_hash: string | null;
  canvas_hash: string | null;
  webgl_hash: string | null;
  webgpu_hash: string | null;
  audio_hash: string | null;
  device_type: string | null;
  os_family: string | null;
  browser_family: string | null;
  first_seen: string;
  last_seen: string;
  scan_count: number;
  ip_history: string[];
}

/**
 * PostgreSQL 實作（生產）。
 * 使用 infra/docker/postgres/init.sql 的 schema。
 */
export class PostgresReportRepository implements ReportRepository {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async saveReport(report: EnvironmentReport, meta?: ReportMeta): Promise<void> {
    const visitorId = report.subjectId ?? report.sessionId;
    await this.pool.query(
      `INSERT INTO fingerprint_scans (
        report_id, tenant_id, schema_version, visitor_id, session_id, source,
        consent_mode, retention_days, sdk_name, sdk_version, client_ip,
        privacy_score, grade, risk_level, signals, issues, scores, integrity, raw,
        created_at, expires_at, fingerprint_hash
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      ON CONFLICT (visitor_id, session_id) DO UPDATE SET
        signals = EXCLUDED.signals,
        issues = EXCLUDED.issues,
        scores = EXCLUDED.scores,
        privacy_score = EXCLUDED.privacy_score,
        grade = EXCLUDED.grade,
        risk_level = EXCLUDED.risk_level,
        fingerprint_hash = COALESCE(fingerprint_scans.fingerprint_hash, EXCLUDED.fingerprint_hash)`,
      [
        report.reportId,
        report.tenantId ?? null,
        report.schemaVersion,
        visitorId,
        report.sessionId,
        report.source,
        report.consent.mode,
        meta?.retentionDays ?? report.consent.retentionDays ?? null,
        report.sdk.name,
        report.sdk.version,
        meta?.clientIp ?? null,
        meta?.privacyScore ?? null,
        meta?.grade ?? null,
        meta?.riskLevel ?? null,
        JSON.stringify(report.signals),
        JSON.stringify(report.issues),
        JSON.stringify(report.scores),
        JSON.stringify(report.integrity),
        report.raw ? JSON.stringify(report.raw) : null,
        report.createdAt,
        meta?.retentionDays
          ? new Date(Date.now() + meta.retentionDays * 24 * 60 * 60 * 1000).toISOString()
          : null,
        meta?.fingerprintHash ?? null,
      ],
    );
  }

  async listRecentClientIps(
    tenantId: string,
    fingerprintHash: string,
    since: string,
    limit = 100,
  ): Promise<string[]> {
    const { rows } = await this.pool.query<{ client_ip: string }>(
      `SELECT DISTINCT client_ip::text AS client_ip
       FROM fingerprint_scans
       WHERE tenant_id = $1 AND fingerprint_hash = $2
         AND client_ip IS NOT NULL AND created_at >= $3
       ORDER BY client_ip
       LIMIT $4`,
      [tenantId, fingerprintHash, since, limit],
    );
    return rows.map((row) => row.client_ip);
  }

  async listSessionsByFingerprint(
    tenantId: string,
    fingerprintHash: string,
    since: string,
    limit = 200,
  ): Promise<DeviceSessionRow[]> {
    const { rows } = await this.pool.query<{
      session_id: string;
      report_id: string | null;
      visitor_id: string;
      client_ip: string | null;
      created_at: string;
    }>(
      `SELECT session_id, report_id, visitor_id, client_ip::text AS client_ip, created_at
       FROM fingerprint_scans
       WHERE tenant_id = $1 AND fingerprint_hash = $2 AND created_at >= $3
       ORDER BY created_at DESC
       LIMIT $4`,
      [tenantId, fingerprintHash, since, limit],
    );
    return rows.map((row) => ({
      sessionId: row.session_id,
      reportId: row.report_id ?? undefined,
      visitorId: row.visitor_id,
      clientIp: row.client_ip ?? undefined,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async listFingerprintsByIp(
    tenantId: string,
    ip: string,
    since: string,
    limit = 50,
  ): Promise<FingerprintByIpRow[]> {
    const { rows } = await this.pool.query<{
      fingerprint_hash: string;
      session_count: string;
      last_seen: string;
    }>(
      `SELECT fingerprint_hash,
              COUNT(*)::int AS session_count,
              MAX(created_at) AS last_seen
       FROM fingerprint_scans
       WHERE tenant_id = $1 AND client_ip = $2::inet
         AND fingerprint_hash IS NOT NULL AND created_at >= $3
       GROUP BY fingerprint_hash
       ORDER BY session_count DESC, last_seen DESC
       LIMIT $4`,
      [tenantId, ip, since, limit],
    );
    return rows.map((row) => ({
      fingerprintHash: row.fingerprint_hash,
      sessionCount: Number(row.session_count),
      lastSeen: new Date(row.last_seen).toISOString(),
    }));
  }

  async getReport(tenantId: string, reportId: string): Promise<StoredReport | null> {
    const { rows } = await this.pool.query<ScanRow>(
      `SELECT *, subject_id FROM fingerprint_scans WHERE report_id = $2 AND tenant_id = $1`,
      [tenantId, reportId],
    );
    const row = rows[0];
    if (!row) return null;
    return this.toStoredReport(row);
  }

  async countReports(tenantId?: string): Promise<number> {
    const { rows } = tenantId
      ? await this.pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM fingerprint_scans WHERE tenant_id = $1`,
          [tenantId],
        )
      : await this.pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM fingerprint_scans`,
        );
    return Number(rows[0]?.count ?? 0);
  }

  async listReportsByTenant(tenantId: string, limit = 20): Promise<StoredReport[]> {
    const { rows } = await this.pool.query<ScanRow>(
      `SELECT *, subject_id FROM fingerprint_scans
       WHERE tenant_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [tenantId, limit],
    );
    return rows.map((row) => this.toStoredReport(row));
  }

  async listReportsByVisitor(
    tenantId: string,
    visitorId: string,
    limit = 20,
  ): Promise<StoredReport[]> {
    const { rows } = await this.pool.query<ScanRow>(
      `SELECT *, subject_id FROM fingerprint_scans
       WHERE (visitor_id = $2 OR session_id = $2) AND tenant_id = $1
       ORDER BY created_at DESC LIMIT $3`,
      [tenantId, visitorId, limit],
    );
    return rows.map((row) => this.toStoredReport(row));
  }

  async upsertVisitor(visitorId: string, profile: VisitorProfile): Promise<void> {
    await this.pool.query(
      `INSERT INTO visitor_profiles (
        visitor_id, hardware_hash, canvas_hash, webgl_hash, webgpu_hash, audio_hash,
        device_type, os_family, browser_family, first_seen, last_seen, scan_count, ip_history
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (visitor_id) DO UPDATE SET
        last_seen = EXCLUDED.last_seen,
        scan_count = visitor_profiles.scan_count + 1,
        ip_history = ARRAY(
          SELECT DISTINCT unnest(visitor_profiles.ip_history || EXCLUDED.ip_history)
        )`,
      [
        visitorId,
        profile.hardwareHash ?? null,
        profile.canvasHash ?? null,
        profile.webglHash ?? null,
        profile.webgpuHash ?? null,
        profile.audioHash ?? null,
        profile.deviceType ?? null,
        profile.osFamily ?? null,
        profile.browserFamily ?? null,
        profile.firstSeen ?? new Date().toISOString(),
        profile.lastSeen ?? new Date().toISOString(),
        profile.scanCount,
        profile.ipHistory,
      ],
    );
  }

  async getVisitor(tenantId: string, visitorId: string): Promise<VisitorProfile | null> {
    const { rows } = await this.pool.query<VisitorRow>(
      `SELECT vp.* FROM visitor_profiles vp
       WHERE vp.visitor_id = $2 AND EXISTS (
         SELECT 1 FROM fingerprint_scans fs
         WHERE (fs.visitor_id = $2 OR fs.session_id = $2) AND fs.tenant_id = $1
       )`,
      [tenantId, visitorId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      visitorId: row.visitor_id,
      hardwareHash: row.hardware_hash ?? undefined,
      canvasHash: row.canvas_hash ?? undefined,
      webglHash: row.webgl_hash ?? undefined,
      webgpuHash: row.webgpu_hash ?? undefined,
      audioHash: row.audio_hash ?? undefined,
      deviceType: row.device_type ?? undefined,
      osFamily: row.os_family ?? undefined,
      browserFamily: row.browser_family ?? undefined,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      scanCount: row.scan_count,
      ipHistory: row.ip_history,
    };
  }

  async deleteReport(tenantId: string, reportId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM fingerprint_scans WHERE report_id = $2 AND tenant_id = $1',
      [tenantId, reportId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deleteExpiredReports(before: string): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM fingerprint_scans WHERE expires_at IS NOT NULL AND expires_at < $1`,
      [before],
    );
    return result.rowCount ?? 0;
  }

  async deleteVisitor(tenantId: string, visitorId: string): Promise<boolean> {
    const scans = await this.pool.query(
      'DELETE FROM fingerprint_scans WHERE (visitor_id = $2 OR session_id = $2) AND tenant_id = $1',
      [tenantId, visitorId],
    );
    // 僅在沒有任何租戶的報告仍參照該訪客時才刪 profile（避免跨租戶誤刪聚合檔案）。
    const profile = await this.pool.query(
      `DELETE FROM visitor_profiles
       WHERE visitor_id = $1 AND NOT EXISTS (
         SELECT 1 FROM fingerprint_scans
         WHERE visitor_id = $1 OR session_id = $1
       )`,
      [visitorId],
    );
    return ((scans.rowCount ?? 0) + (profile.rowCount ?? 0)) > 0;
  }

  private toStoredReport(row: ScanRow): StoredReport {
    return {
      reportId: row.report_id,
      tenantId: row.tenant_id ?? undefined,
      schemaVersion: row.schema_version,
      sessionId: row.session_id,
      subjectId: row.subject_id ?? undefined,
      source: row.source as EnvironmentReport['source'],
      createdAt: row.created_at,
      consent: {
        mode: row.consent_mode as EnvironmentReport['consent']['mode'],
        retentionDays: row.retention_days ?? undefined,
      },
      sdk: {
        name: row.sdk_name,
        version: row.sdk_version,
        platform: 'browser',
      },
      signals: row.signals as EnvironmentReport['signals'],
      issues: row.issues as EnvironmentReport['issues'],
      scores: row.scores as EnvironmentReport['scores'],
      integrity: row.integrity as EnvironmentReport['integrity'],
      raw: row.raw ?? undefined,
      clientIp: row.client_ip ?? undefined,
      privacyScore: row.privacy_score ?? undefined,
      grade: row.grade ?? undefined,
      riskLevel: row.risk_level ?? undefined,
    };
  }
}
