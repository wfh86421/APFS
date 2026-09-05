import pg from 'pg';
import type {
  EvidenceConfidence,
  FieldDefinition,
  RiskEvent,
  Severity,
} from '@shieldscan/core-schema';
import type { RiskEventFilter, RiskRepository } from './types.js';

const { Pool } = pg;

interface RiskEventRow {
  event_id: string;
  tenant_id: string | null;
  session_id: string;
  report_id: string | null;
  event_type: RiskEvent['eventType'];
  severity: Severity;
  confidence: EvidenceConfidence;
  evidence_json: unknown;
  rule_id: string;
  rule_version: string;
  score_impact: number | null;
  auto_action: string | null;
  review_required: boolean;
  detected_at: string;
  review_status: string | null;
  reviewer_id: string | null;
  false_positive_flag: boolean | null;
}

interface FieldDefinitionRow {
  field_path: string;
  display_name: string;
  category: FieldDefinition['category'];
  sensitivity: FieldDefinition['sensitivity'];
  default_confidence: EvidenceConfidence;
  stability: FieldDefinition['stability'];
  purpose: string;
  retention_class: FieldDefinition['retentionClass'];
  access_roles: string[];
  ui_module: string;
  status: FieldDefinition['status'];
  version: string;
}

/** Phase 1：PostgreSQL 風險事件／欄位定義（使用 init.sql 新增表）。 */
export class PostgresRiskRepository implements RiskRepository {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async insertRiskEvent(event: RiskEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO risk_events (
        event_id, tenant_id, session_id, report_id, event_type, severity, confidence,
        evidence_json, rule_id, rule_version, score_impact, auto_action,
        review_required, detected_at, review_status, reviewer_id, false_positive_flag
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      ON CONFLICT (event_id) DO UPDATE SET
        review_status = EXCLUDED.review_status,
        reviewer_id = EXCLUDED.reviewer_id,
        false_positive_flag = EXCLUDED.false_positive_flag`,
      [
        event.eventId,
        event.tenantId ?? null,
        event.sessionId,
        event.reportId ?? null,
        event.eventType,
        event.severity,
        event.confidence,
        JSON.stringify(event.evidenceJson),
        event.ruleId,
        event.ruleVersion,
        event.scoreImpact ?? null,
        event.autoAction ?? null,
        event.reviewRequired,
        event.detectedAt,
        event.reviewStatus ?? null,
        event.reviewerId ?? null,
        event.falsePositiveFlag ?? null,
      ],
    );
  }

  async insertRiskEvents(events: RiskEvent[]): Promise<void> {
    for (const event of events) await this.insertRiskEvent(event);
  }

  async listRiskEvents(filter: RiskEventFilter = {}): Promise<RiskEvent[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.sessionId) {
      params.push(filter.sessionId);
      conditions.push(`session_id = $${params.length}`);
    }
    if (filter.severity) {
      params.push(filter.severity);
      conditions.push(`severity = $${params.length}`);
    }
    if (filter.eventType) {
      params.push(filter.eventType);
      conditions.push(`event_type = $${params.length}`);
    }
    const limit = filter.limit ?? 100;
    params.push(limit);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await this.pool.query<RiskEventRow>(
      `SELECT * FROM risk_events ${where} ORDER BY detected_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(this.toRiskEvent);
  }

  async upsertFieldDefinition(definition: FieldDefinition): Promise<void> {
    await this.pool.query(
      `INSERT INTO field_definitions (
        field_path, display_name, category, sensitivity, default_confidence,
        stability, purpose, retention_class, access_roles, ui_module, status, version
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (field_path) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        category = EXCLUDED.category,
        sensitivity = EXCLUDED.sensitivity,
        default_confidence = EXCLUDED.default_confidence,
        stability = EXCLUDED.stability,
        purpose = EXCLUDED.purpose,
        retention_class = EXCLUDED.retention_class,
        access_roles = EXCLUDED.access_roles,
        ui_module = EXCLUDED.ui_module,
        status = EXCLUDED.status,
        version = EXCLUDED.version,
        updated_at = NOW()`,
      [
        definition.fieldPath,
        definition.displayName,
        definition.category,
        definition.sensitivity,
        definition.defaultConfidence,
        definition.stability,
        definition.purpose,
        definition.retentionClass,
        definition.accessRoles,
        definition.uiModule,
        definition.status,
        definition.version,
      ],
    );
  }

  async listFieldDefinitions(limit = 500): Promise<FieldDefinition[]> {
    const { rows } = await this.pool.query<FieldDefinitionRow>(
      `SELECT * FROM field_definitions ORDER BY field_path LIMIT $1`,
      [limit],
    );
    return rows.map(this.toFieldDefinition);
  }

  private toRiskEvent(row: RiskEventRow): RiskEvent {
    return {
      eventId: row.event_id,
      tenantId: row.tenant_id ?? undefined,
      sessionId: row.session_id,
      reportId: row.report_id ?? undefined,
      eventType: row.event_type,
      severity: row.severity,
      confidence: row.confidence,
      evidenceJson: row.evidence_json as RiskEvent['evidenceJson'],
      ruleId: row.rule_id,
      ruleVersion: row.rule_version,
      scoreImpact: row.score_impact ?? undefined,
      autoAction: (row.auto_action as RiskEvent['autoAction']) ?? undefined,
      reviewRequired: row.review_required,
      detectedAt: new Date(row.detected_at).toISOString(),
      reviewStatus:
        (row.review_status as RiskEvent['reviewStatus']) ?? undefined,
      reviewerId: row.reviewer_id ?? undefined,
      falsePositiveFlag: row.false_positive_flag ?? undefined,
    };
  }

  private toFieldDefinition(row: FieldDefinitionRow): FieldDefinition {
    return {
      fieldPath: row.field_path,
      displayName: row.display_name,
      category: row.category,
      sensitivity: row.sensitivity,
      defaultConfidence: row.default_confidence,
      stability: row.stability,
      purpose: row.purpose,
      retentionClass: row.retention_class,
      accessRoles: row.access_roles,
      uiModule: row.ui_module,
      status: row.status,
      version: row.version,
    };
  }
}
