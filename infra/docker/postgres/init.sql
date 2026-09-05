-- =====================================================================
-- ShieldScan PostgreSQL 初始 Schema（Phase 2）
-- 掛載方式：docker-compose 中 postgres volumes 指向本檔
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 核心檢測報告表
CREATE TABLE IF NOT EXISTS fingerprint_scans (
    report_id       UUID PRIMARY KEY,
    schema_version  VARCHAR(16) NOT NULL DEFAULT '0.1.0',
    visitor_id      VARCHAR(64) NOT NULL,
    subject_id      VARCHAR(64),
    session_id      VARCHAR(64) NOT NULL,
    source          VARCHAR(16) NOT NULL,
    consent_mode    VARCHAR(16) NOT NULL,
    retention_days  INTEGER,
    sdk_name        VARCHAR(128) NOT NULL,
    sdk_version     VARCHAR(32) NOT NULL,
    client_ip       INET,
    privacy_score   SMALLINT CHECK (privacy_score BETWEEN 0 AND 100),
    grade           CHAR(1) CHECK (grade IN ('A','B','C','D','F')),
    risk_level      VARCHAR(16) CHECK (risk_level IN ('low','medium','high','critical')),
    signals         JSONB NOT NULL DEFAULT '[]',
    issues          JSONB NOT NULL DEFAULT '[]',
    scores          JSONB NOT NULL DEFAULT '{}',
    integrity       JSONB NOT NULL DEFAULT '{}',
    raw             JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    UNIQUE (visitor_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_scans_visitor_id  ON fingerprint_scans(visitor_id);
CREATE INDEX IF NOT EXISTS idx_scans_created_at  ON fingerprint_scans(created_at);
CREATE INDEX IF NOT EXISTS idx_scans_client_ip   ON fingerprint_scans(client_ip);
CREATE INDEX IF NOT EXISTS idx_scans_score       ON fingerprint_scans(privacy_score);
CREATE INDEX IF NOT EXISTS idx_scans_signals     ON fingerprint_scans USING GIN(signals);

-- 訪客設備檔案表（同 visitor 跨 IP 追蹤）
CREATE TABLE IF NOT EXISTS visitor_profiles (
    visitor_id       VARCHAR(64) PRIMARY KEY,
    hardware_hash    VARCHAR(64),
    canvas_hash      VARCHAR(64),
    webgl_hash       VARCHAR(64),
    webgpu_hash      VARCHAR(64),
    audio_hash       VARCHAR(64),
    device_type      VARCHAR(32),
    os_family        VARCHAR(32),
    browser_family   VARCHAR(32),
    first_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scan_count       INTEGER NOT NULL DEFAULT 1,
    ip_history       INET[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_visitor_hardware ON visitor_profiles(hardware_hash);

-- IP 信譽庫
CREATE TABLE IF NOT EXISTS ip_reputation (
    ip_range          CIDR PRIMARY KEY,
    reputation_score  SMALLINT CHECK (reputation_score BETWEEN 0 AND 100),
    categories        TEXT[] NOT NULL DEFAULT '{}',
    first_seen        TIMESTAMPTZ,
    last_seen         TIMESTAMPTZ,
    source            VARCHAR(64)
);

-- GeoIP 快取
CREATE TABLE IF NOT EXISTS geoip_cache (
    ip_range     CIDR PRIMARY KEY,
    country      VARCHAR(64),
    region       VARCHAR(64),
    city         VARCHAR(64),
    postal_code  VARCHAR(16),
    latitude     DOUBLE PRECISION,
    longitude    DOUBLE PRECISION,
    isp          VARCHAR(128),
    asn          VARCHAR(32),
    proxy        BOOLEAN,
    vpn          BOOLEAN,
    tor          BOOLEAN,
    datacenter   BOOLEAN,
    cached_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ
);

-- 審計日誌（端口掃描等敏感操作）
CREATE TABLE IF NOT EXISTS audit_logs (
    id            BIGSERIAL PRIMARY KEY,
    action        VARCHAR(64) NOT NULL,
    target_ip     INET,
    actor_ip      INET,
    metadata      JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_logs(action);

-- =====================================================================
-- Phase 3：租戶 / API Key / 用量計費 / Webhook
-- =====================================================================

CREATE TABLE IF NOT EXISTS tenants (
    tenant_id   UUID PRIMARY KEY,
    name        VARCHAR(128) NOT NULL,
    email       VARCHAR(256) NOT NULL,
    plan        VARCHAR(16) NOT NULL DEFAULT 'free',
    status      VARCHAR(16) NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
    key_id       UUID PRIMARY KEY,
    tenant_id    UUID NOT NULL REFERENCES tenants(tenant_id),
    label        VARCHAR(128) NOT NULL,
    key_hash     VARCHAR(64) UNIQUE NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);

CREATE TABLE IF NOT EXISTS usage_records (
    id         UUID PRIMARY KEY,
    tenant_id  UUID NOT NULL REFERENCES tenants(tenant_id),
    units      INTEGER NOT NULL DEFAULT 1,
    kind       VARCHAR(32) NOT NULL DEFAULT 'report',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_tenant_time ON usage_records(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS billing_records (
    id            UUID PRIMARY KEY,
    tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id),
    period_start  TIMESTAMPTZ NOT NULL,
    period_end    TIMESTAMPTZ NOT NULL,
    usage_units   INTEGER NOT NULL DEFAULT 0,
    base_price    INTEGER NOT NULL DEFAULT 0,
    overage_units INTEGER NOT NULL DEFAULT 0,
    overage_price INTEGER NOT NULL DEFAULT 0,
    total_price   INTEGER NOT NULL DEFAULT 0,
    currency      VARCHAR(8) NOT NULL DEFAULT 'TWD',
    status        VARCHAR(16) NOT NULL DEFAULT 'draft',
    invoice_no    VARCHAR(32),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_tenant ON billing_records(tenant_id);

CREATE TABLE IF NOT EXISTS webhooks (
    id          UUID PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES tenants(tenant_id),
    url         TEXT NOT NULL,
    events      TEXT[] NOT NULL DEFAULT '{"risk_event"}',
    is_enabled  BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- Phase 1（風險偵測管理平台）：風險事件 / 欄位定義（Schema Registry）
-- =====================================================================

CREATE TABLE IF NOT EXISTS risk_events (
    event_id           UUID PRIMARY KEY,
    tenant_id          UUID,
    session_id         VARCHAR(64) NOT NULL,
    report_id          UUID,
    event_type         VARCHAR(48) NOT NULL,
    severity           VARCHAR(16) NOT NULL CHECK (severity IN ('info','low','medium','high','critical')),
    confidence         VARCHAR(8) NOT NULL CHECK (confidence IN ('low','medium','high')),
    evidence_json      JSONB NOT NULL DEFAULT '{}',
    rule_id            VARCHAR(128) NOT NULL,
    rule_version       VARCHAR(16) NOT NULL,
    score_impact       SMALLINT,
    auto_action        VARCHAR(16),
    review_required    BOOLEAN NOT NULL DEFAULT true,
    detected_at        TIMESTAMPTZ NOT NULL,
    review_status      VARCHAR(16) CHECK (review_status IN ('pending','in_review','reviewed','closed')),
    reviewer_id        VARCHAR(64),
    false_positive_flag BOOLEAN,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_events_session    ON risk_events(session_id);
CREATE INDEX IF NOT EXISTS idx_risk_events_detected   ON risk_events(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_events_severity   ON risk_events(severity);
CREATE INDEX IF NOT EXISTS idx_risk_events_type       ON risk_events(event_type);
CREATE INDEX IF NOT EXISTS idx_risk_events_report     ON risk_events(report_id);

CREATE TABLE IF NOT EXISTS field_definitions (
    field_path        TEXT PRIMARY KEY,
    display_name      VARCHAR(256) NOT NULL,
    category          VARCHAR(32) NOT NULL,
    sensitivity       VARCHAR(16) NOT NULL CHECK (sensitivity IN ('low','medium','high','critical')),
    default_confidence VARCHAR(8) NOT NULL CHECK (default_confidence IN ('low','medium','high')),
    stability         VARCHAR(16) NOT NULL CHECK (stability IN ('stable','volatile','unknown')),
    purpose           TEXT NOT NULL,
    retention_class   VARCHAR(16) NOT NULL CHECK (retention_class IN ('short','medium','long','policy')),
    access_roles      TEXT[] NOT NULL DEFAULT '{}',
    ui_module         VARCHAR(64) NOT NULL,
    status            VARCHAR(16) NOT NULL CHECK (status IN ('active','experimental','deprecated','removed')),
    version           VARCHAR(16) NOT NULL,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_defs_status    ON field_definitions(status);
CREATE INDEX IF NOT EXISTS idx_field_defs_category  ON field_definitions(category);

CREATE TABLE IF NOT EXISTS device_fingerprints (
    fingerprint_hash   VARCHAR(64) PRIMARY KEY,
    tenant_id          UUID,
    canvas_hash        VARCHAR(64),
    webgl_hash         VARCHAR(64),
    webgpu_hash        VARCHAR(64),
    audio_hash         VARCHAR(64),
    fonts_hash         VARCHAR(64),
    client_rects_hash  VARCHAR(64),
    unmasked_vendor    VARCHAR(128),
    unmasked_renderer  VARCHAR(128),
    screen_signature   VARCHAR(128),
    hardware_signature VARCHAR(128),
    first_seen         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_count      INTEGER NOT NULL DEFAULT 1,
    ip_count           INTEGER NOT NULL DEFAULT 1,
    stability_score    DOUBLE PRECISION,
    entropy_score      DOUBLE PRECISION,
    retention_until    TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_fp_tenant   ON device_fingerprints(tenant_id);
CREATE INDEX IF NOT EXISTS idx_device_fp_last_seen ON device_fingerprints(last_seen DESC);

CREATE TABLE IF NOT EXISTS network_signals (
    session_id         VARCHAR(64) PRIMARY KEY,
    report_id          UUID,
    tenant_id          UUID,
    ip_address         INET,
    ip_confidence      VARCHAR(8) CHECK (ip_confidence IN ('low','medium','high')),
    isp                VARCHAR(128),
    asn                VARCHAR(32),
    network_type       VARCHAR(32),
    ip_history_7d      INTEGER,
    ip_history_30d     INTEGER,
    proxy_detected     BOOLEAN,
    vpn_detected       BOOLEAN,
    tor_detected       BOOLEAN,
    webrtc_ip          INET,
    webrtc_stun_ip     INET,
    webrtc_mismatch    BOOLEAN,
    dns_leak_status    VARCHAR(16),
    dns_leak_list      TEXT[] NOT NULL DEFAULT '{}',
    open_ports         INTEGER[] NOT NULL DEFAULT '{}',
    country            VARCHAR(64),
    region             VARCHAR(64),
    city               VARCHAR(64),
    postal_code        VARCHAR(16),
    latitude           DOUBLE PRECISION,
    longitude          DOUBLE PRECISION,
    geo_confidence     VARCHAR(8) CHECK (geo_confidence IN ('low','medium','high')),
    timezone_ip        VARCHAR(64),
    timezone_js        VARCHAR(64),
    time_consistency   BOOLEAN,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_network_report ON network_signals(report_id);
CREATE INDEX IF NOT EXISTS idx_network_tenant ON network_signals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_network_open_ports ON network_signals USING GIN(open_ports);

CREATE TABLE IF NOT EXISTS review_cases (
    case_id           UUID PRIMARY KEY,
    session_id        VARCHAR(64) NOT NULL,
    report_id         UUID,
    risk_event_ids    UUID[] NOT NULL DEFAULT '{}',
    status            VARCHAR(16) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','in_review','reviewed','closed')),
    priority          VARCHAR(8) NOT NULL DEFAULT 'medium'
                      CHECK (priority IN ('low','medium','high','urgent')),
    assigned_to       VARCHAR(64),
    reviewer_id       VARCHAR(64),
    opened_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at         TIMESTAMPTZ,
    decision          VARCHAR(16) CHECK (decision IN ('allow','review','challenge','limit','block','log_only')),
    reason            TEXT NOT NULL,
    false_positive_flag BOOLEAN,
    appeal_status     VARCHAR(16) NOT NULL DEFAULT 'none'
                      CHECK (appeal_status IN ('none','pending','accepted','rejected')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_status    ON review_cases(status);
CREATE INDEX IF NOT EXISTS idx_review_report    ON review_cases(report_id);
CREATE INDEX IF NOT EXISTS idx_review_opened    ON review_cases(opened_at DESC);

CREATE TABLE IF NOT EXISTS appeal_cases (
    appeal_id     UUID PRIMARY KEY,
    case_id       UUID NOT NULL REFERENCES review_cases(case_id),
    reason        TEXT NOT NULL,
    status        VARCHAR(16) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','rejected')),
    decision      VARCHAR(16) CHECK (decision IN ('allow','review','challenge','limit','block','log_only')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appeal_case   ON appeal_cases(case_id);
CREATE INDEX IF NOT EXISTS idx_appeal_status ON appeal_cases(status);
