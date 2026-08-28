import pg from 'pg';
import type { EnvironmentReport } from '@shieldscan/core-schema';
import type { ReportMeta, ReportRepository, StoredReport, VisitorProfile } from './types.js';

const { Pool } = pg;

interface ScanRow {
  report_id: string;
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
        report_id, schema_version, visitor_id, session_id, source,
        consent_mode, retention_days, sdk_name, sdk_version, client_ip,
        privacy_score, grade, risk_level, signals, issues, scores, integrity, raw,
        created_at, expires_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      ON CONFLICT (visitor_id, session_id) DO UPDATE SET
        signals = EXCLUDED.signals,
        issues = EXCLUDED.issues,
        scores = EXCLUDED.scores,
        privacy_score = EXCLUDED.privacy_score,
        grade = EXCLUDED.grade,
        risk_level = EXCLUDED.risk_level`,
      [
        report.reportId,
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
      ],
    );
  }

  async getReport(reportId: string): Promise<StoredReport | null> {
    const { rows } = await this.pool.query<ScanRow>(
      `SELECT *, subject_id FROM fingerprint_scans WHERE report_id = $1`,
      [reportId],
    );
    const row = rows[0];
    if (!row) return null;
    return this.toStoredReport(row);
  }

  async listReportsByVisitor(visitorId: string, limit = 20): Promise<StoredReport[]> {
    const { rows } = await this.pool.query<ScanRow>(
      `SELECT *, subject_id FROM fingerprint_scans
       WHERE visitor_id = $1 OR session_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [visitorId, limit],
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

  async getVisitor(visitorId: string): Promise<VisitorProfile | null> {
    const { rows } = await this.pool.query<VisitorRow>(
      `SELECT * FROM visitor_profiles WHERE visitor_id = $1`,
      [visitorId],
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

  private toStoredReport(row: ScanRow): StoredReport {
    return {
      reportId: row.report_id,
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
