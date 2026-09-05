import pg from 'pg';
import type {
  AppealCase,
  EvidenceConfidence,
  FieldDefinition,
  ReviewCase,
  RiskEvent,
  Severity,
} from '@shieldscan/core-schema';
import type {
  DeviceFingerprint,
  NetworkSignal,
  ReviewCasePatch,
  RiskEventFilter,
  RiskRepository,
} from './types.js';

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

interface DeviceFingerprintRow {
  fingerprint_hash: string;
  tenant_id: string | null;
  canvas_hash: string | null;
  webgl_hash: string | null;
  webgpu_hash: string | null;
  audio_hash: string | null;
  fonts_hash: string | null;
  client_rects_hash: string | null;
  unmasked_vendor: string | null;
  unmasked_renderer: string | null;
  screen_signature: string | null;
  hardware_signature: string | null;
  first_seen: string;
  last_seen: string;
  session_count: number;
  ip_count: number;
  stability_score: number | null;
  entropy_score: number | null;
  retention_until: string | null;
}

interface NetworkSignalRow {
  session_id: string;
  report_id: string | null;
  tenant_id: string | null;
  ip_address: string | null;
  ip_confidence: NetworkSignal['ipConfidence'];
  isp: string | null;
  asn: string | null;
  network_type: string | null;
  ip_history_7d: number | null;
  ip_history_30d: number | null;
  proxy_detected: boolean | null;
  vpn_detected: boolean | null;
  tor_detected: boolean | null;
  webrtc_ip: string | null;
  webrtc_stun_ip: string | null;
  webrtc_mismatch: boolean | null;
  dns_leak_status: string | null;
  dns_leak_list: string[];
  open_ports: number[];
  country: string | null;
  region: string | null;
  city: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_confidence: NetworkSignal['geoConfidence'];
  timezone_ip: string | null;
  timezone_js: string | null;
  time_consistency: boolean | null;
}

interface ReviewCaseRow {
  case_id: string;
  session_id: string;
  report_id: string | null;
  risk_event_ids: string[];
  status: ReviewCase['status'];
  priority: ReviewCase['priority'];
  assigned_to: string | null;
  reviewer_id: string | null;
  opened_at: string;
  closed_at: string | null;
  decision: ReviewCase['decision'];
  reason: string;
  false_positive_flag: boolean | null;
  appeal_status: ReviewCase['appealStatus'];
}

interface AppealRow {
  appeal_id: string;
  case_id: string;
  reason: string;
  status: AppealCase['status'];
  decision: AppealCase['decision'];
  created_at: string;
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

  async upsertDeviceFingerprint(device: DeviceFingerprint): Promise<void> {
    await this.pool.query(
      `INSERT INTO device_fingerprints (
        fingerprint_hash, tenant_id, canvas_hash, webgl_hash, webgpu_hash,
        audio_hash, fonts_hash, client_rects_hash, unmasked_vendor,
        unmasked_renderer, screen_signature, hardware_signature,
        first_seen, last_seen, session_count, ip_count,
        stability_score, entropy_score, retention_until
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      ON CONFLICT (fingerprint_hash) DO UPDATE SET
        canvas_hash = EXCLUDED.canvas_hash,
        webgl_hash = EXCLUDED.webgl_hash,
        webgpu_hash = EXCLUDED.webgpu_hash,
        audio_hash = EXCLUDED.audio_hash,
        fonts_hash = EXCLUDED.fonts_hash,
        client_rects_hash = EXCLUDED.client_rects_hash,
        unmasked_vendor = EXCLUDED.unmasked_vendor,
        unmasked_renderer = EXCLUDED.unmasked_renderer,
        screen_signature = EXCLUDED.screen_signature,
        hardware_signature = EXCLUDED.hardware_signature,
        last_seen = EXCLUDED.last_seen,
        session_count = device_fingerprints.session_count + EXCLUDED.session_count,
        ip_count = device_fingerprints.ip_count + EXCLUDED.ip_count,
        stability_score = EXCLUDED.stability_score,
        entropy_score = EXCLUDED.entropy_score,
        retention_until = EXCLUDED.retention_until`,
      [
        device.fingerprintHash,
        device.tenantId ?? null,
        device.canvasHash ?? null,
        device.webglHash ?? null,
        device.webgpuHash ?? null,
        device.audioHash ?? null,
        device.fontsHash ?? null,
        device.clientRectsHash ?? null,
        device.unmaskedVendor ?? null,
        device.unmaskedRenderer ?? null,
        device.screenSignature ?? null,
        device.hardwareSignature ?? null,
        device.firstSeen ?? new Date().toISOString(),
        device.lastSeen ?? new Date().toISOString(),
        device.sessionCount,
        device.ipCount,
        device.stabilityScore ?? null,
        device.entropyScore ?? null,
        device.retentionUntil ?? null,
      ],
    );
  }

  async getDeviceFingerprint(fingerprintHash: string): Promise<DeviceFingerprint | null> {
    const { rows } = await this.pool.query<DeviceFingerprintRow>(
      `SELECT * FROM device_fingerprints WHERE fingerprint_hash = $1`,
      [fingerprintHash],
    );
    const row = rows[0];
    return row ? this.toDeviceFingerprint(row) : null;
  }

  async listDeviceFingerprints(limit = 100): Promise<DeviceFingerprint[]> {
    const { rows } = await this.pool.query<DeviceFingerprintRow>(
      `SELECT * FROM device_fingerprints ORDER BY last_seen DESC LIMIT $1`,
      [limit],
    );
    return rows.map(this.toDeviceFingerprint);
  }

  async upsertNetworkSignal(signal: NetworkSignal): Promise<void> {
    await this.pool.query(
      `INSERT INTO network_signals (
        session_id, report_id, tenant_id, ip_address, ip_confidence, isp, asn,
        network_type, ip_history_7d, ip_history_30d, proxy_detected,
        vpn_detected, tor_detected, webrtc_ip, webrtc_stun_ip, webrtc_mismatch,
        dns_leak_status, dns_leak_list, open_ports, country, region, city,
        postal_code, latitude, longitude, geo_confidence, timezone_ip,
        timezone_js, time_consistency
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
      ON CONFLICT (session_id) DO UPDATE SET
        report_id = EXCLUDED.report_id,
        ip_address = EXCLUDED.ip_address,
        ip_confidence = EXCLUDED.ip_confidence,
        isp = EXCLUDED.isp,
        asn = EXCLUDED.asn,
        network_type = EXCLUDED.network_type,
        ip_history_7d = EXCLUDED.ip_history_7d,
        ip_history_30d = EXCLUDED.ip_history_30d,
        proxy_detected = EXCLUDED.proxy_detected,
        vpn_detected = EXCLUDED.vpn_detected,
        tor_detected = EXCLUDED.tor_detected,
        webrtc_ip = EXCLUDED.webrtc_ip,
        webrtc_stun_ip = EXCLUDED.webrtc_stun_ip,
        webrtc_mismatch = EXCLUDED.webrtc_mismatch,
        dns_leak_status = EXCLUDED.dns_leak_status,
        dns_leak_list = EXCLUDED.dns_leak_list,
        open_ports = EXCLUDED.open_ports,
        country = EXCLUDED.country,
        region = EXCLUDED.region,
        city = EXCLUDED.city,
        postal_code = EXCLUDED.postal_code,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        geo_confidence = EXCLUDED.geo_confidence,
        timezone_ip = EXCLUDED.timezone_ip,
        timezone_js = EXCLUDED.timezone_js,
        time_consistency = EXCLUDED.time_consistency,
        updated_at = NOW()`,
      [
        signal.sessionId,
        signal.reportId ?? null,
        signal.tenantId ?? null,
        signal.ipAddress ?? null,
        signal.ipConfidence ?? null,
        signal.isp ?? null,
        signal.asn ?? null,
        signal.networkType ?? null,
        signal.ipHistory7d ?? null,
        signal.ipHistory30d ?? null,
        signal.proxyDetected ?? null,
        signal.vpnDetected ?? null,
        signal.torDetected ?? null,
        signal.webrtcIp ?? null,
        signal.webrtcStunIp ?? null,
        signal.webrtcMismatch ?? null,
        signal.dnsLeakStatus ?? null,
        signal.dnsLeakList ?? [],
        signal.openPorts ?? [],
        signal.country ?? null,
        signal.region ?? null,
        signal.city ?? null,
        signal.postalCode ?? null,
        signal.latitude ?? null,
        signal.longitude ?? null,
        signal.geoConfidence ?? null,
        signal.timezoneIp ?? null,
        signal.timezoneJs ?? null,
        signal.timeConsistency ?? null,
      ],
    );
  }

  async getNetworkSignal(sessionId: string): Promise<NetworkSignal | null> {
    const { rows } = await this.pool.query<NetworkSignalRow>(
      `SELECT * FROM network_signals WHERE session_id = $1`,
      [sessionId],
    );
    const row = rows[0];
    return row ? this.toNetworkSignal(row) : null;
  }

  async createReviewCase(caseData: ReviewCase): Promise<void> {
    await this.pool.query(
      `INSERT INTO review_cases (
        case_id, session_id, report_id, risk_event_ids, status, priority,
        assigned_to, reviewer_id, opened_at, closed_at, decision,
        reason, false_positive_flag, appeal_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (case_id) DO UPDATE SET
        status = EXCLUDED.status,
        decision = EXCLUDED.decision,
        reason = EXCLUDED.reason,
        false_positive_flag = EXCLUDED.false_positive_flag,
        appeal_status = EXCLUDED.appeal_status`,
      [
        caseData.caseId,
        caseData.sessionId,
        caseData.reportId ?? null,
        caseData.riskEventIds ?? [],
        caseData.status,
        caseData.priority,
        caseData.assignedTo ?? null,
        caseData.assignedTo ?? null,
        caseData.openedAt,
        caseData.closedAt ?? null,
        caseData.decision ?? null,
        caseData.reason,
        caseData.falsePositiveFlag ?? null,
        caseData.appealStatus,
      ],
    );
  }

  async listReviewCases(filter: {
    status?: ReviewCase['status'];
    limit?: number;
  } = {}): Promise<ReviewCase[]> {
    const params: unknown[] = [];
    let where = '';
    if (filter.status) {
      params.push(filter.status);
      where = `WHERE status = $1`;
    }
    params.push(filter.limit ?? 100);
    const { rows } = await this.pool.query<ReviewCaseRow>(
      `SELECT * FROM review_cases ${where} ORDER BY opened_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(this.toReviewCase);
  }

  async getReviewCase(caseId: string): Promise<ReviewCase | null> {
    const { rows } = await this.pool.query<ReviewCaseRow>(
      `SELECT * FROM review_cases WHERE case_id = $1`,
      [caseId],
    );
    const row = rows[0];
    return row ? this.toReviewCase(row) : null;
  }

  async updateReviewCase(
    caseId: string,
    patch: ReviewCasePatch,
  ): Promise<ReviewCase | null> {
    await this.pool.query(
      `UPDATE review_cases SET
        status = COALESCE($2, status),
        decision = COALESCE($3, decision),
        reason = COALESCE($4, reason),
        reviewer_id = COALESCE($5, reviewer_id),
        false_positive_flag = COALESCE($6, false_positive_flag),
        closed_at = COALESCE($7, closed_at)
      WHERE case_id = $1`,
      [
        caseId,
        patch.status ?? null,
        patch.decision ?? null,
        patch.reason ?? null,
        patch.reviewerId ?? null,
        patch.falsePositiveFlag ?? null,
        patch.closedAt ?? null,
      ],
    );
    return this.getReviewCase(caseId);
  }

  async createAppeal(appeal: AppealCase): Promise<void> {
    await this.pool.query(
      `INSERT INTO appeal_cases (appeal_id, case_id, reason, status, decision, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (appeal_id) DO NOTHING`,
      [
        appeal.appealId,
        appeal.caseId,
        appeal.reason,
        appeal.status,
        appeal.decision ?? null,
        appeal.createdAt,
      ],
    );
    await this.pool.query(
      `UPDATE review_cases SET appeal_status = 'pending'
       WHERE case_id = $1 AND appeal_status = 'none'`,
      [appeal.caseId],
    );
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

  private toDeviceFingerprint(row: DeviceFingerprintRow): DeviceFingerprint {
    return {
      fingerprintHash: row.fingerprint_hash,
      tenantId: row.tenant_id ?? undefined,
      canvasHash: row.canvas_hash ?? undefined,
      webglHash: row.webgl_hash ?? undefined,
      webgpuHash: row.webgpu_hash ?? undefined,
      audioHash: row.audio_hash ?? undefined,
      fontsHash: row.fonts_hash ?? undefined,
      clientRectsHash: row.client_rects_hash ?? undefined,
      unmaskedVendor: row.unmasked_vendor ?? undefined,
      unmaskedRenderer: row.unmasked_renderer ?? undefined,
      screenSignature: row.screen_signature ?? undefined,
      hardwareSignature: row.hardware_signature ?? undefined,
      firstSeen: new Date(row.first_seen).toISOString(),
      lastSeen: new Date(row.last_seen).toISOString(),
      sessionCount: row.session_count,
      ipCount: row.ip_count,
      stabilityScore: row.stability_score ?? undefined,
      entropyScore: row.entropy_score ?? undefined,
      retentionUntil: row.retention_until ?? undefined,
    };
  }

  private toNetworkSignal(row: NetworkSignalRow): NetworkSignal {
    return {
      sessionId: row.session_id,
      reportId: row.report_id ?? undefined,
      tenantId: row.tenant_id ?? undefined,
      ipAddress: row.ip_address ?? undefined,
      ipConfidence: row.ip_confidence ?? undefined,
      isp: row.isp ?? undefined,
      asn: row.asn ?? undefined,
      networkType: row.network_type ?? undefined,
      ipHistory7d: row.ip_history_7d ?? undefined,
      ipHistory30d: row.ip_history_30d ?? undefined,
      proxyDetected: row.proxy_detected ?? undefined,
      vpnDetected: row.vpn_detected ?? undefined,
      torDetected: row.tor_detected ?? undefined,
      webrtcIp: row.webrtc_ip ?? undefined,
      webrtcStunIp: row.webrtc_stun_ip ?? undefined,
      webrtcMismatch: row.webrtc_mismatch ?? undefined,
      dnsLeakStatus: row.dns_leak_status ?? undefined,
      dnsLeakList: row.dns_leak_list,
      openPorts: row.open_ports,
      country: row.country ?? undefined,
      region: row.region ?? undefined,
      city: row.city ?? undefined,
      postalCode: row.postal_code ?? undefined,
      latitude: row.latitude ?? undefined,
      longitude: row.longitude ?? undefined,
      geoConfidence: row.geo_confidence ?? undefined,
      timezoneIp: row.timezone_ip ?? undefined,
      timezoneJs: row.timezone_js ?? undefined,
      timeConsistency: row.time_consistency ?? undefined,
    };
  }

  private toReviewCase(row: ReviewCaseRow): ReviewCase {
    return {
      caseId: row.case_id,
      sessionId: row.session_id,
      reportId: row.report_id ?? undefined,
      riskEventIds: row.risk_event_ids,
      status: row.status,
      priority: row.priority,
      assignedTo: row.assigned_to ?? undefined,
      openedAt: new Date(row.opened_at).toISOString(),
      closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : undefined,
      decision: row.decision ?? undefined,
      reason: row.reason,
      falsePositiveFlag: row.false_positive_flag ?? undefined,
      appealStatus: row.appeal_status,
    };
  }
}
