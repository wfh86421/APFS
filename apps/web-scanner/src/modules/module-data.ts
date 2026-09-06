/**
 * 後台模組（6＋1）的資料字典：每個模組對應的 API 與資料欄位。
 * 未來可由 field_definitions / Plugin Registry 動態供應。
 */

export interface ModuleFieldRef {
  fieldPath: string;
  label: string;
}

export interface ModuleDataRef {
  id: string;
  api: string;
  fields: ModuleFieldRef[];
}

export const MODULE_DATA: Record<string, ModuleDataRef> = {
  'decision.verdict': {
    id: 'decision.verdict',
    api: '/v1/reports/:id',
    fields: [
      { fieldPath: 'overview.visitor_id', label: '訪客 ID' },
      { fieldPath: 'overview.report_id', label: '報告 ID' },
      { fieldPath: 'overview.risk_score', label: '風險分數' },
      { fieldPath: 'overview.risk_level', label: '風險等級' },
      { fieldPath: 'overview.confidence', label: '置信度' },
      { fieldPath: 'overview.flags', label: '風險標籤' },
      { fieldPath: 'policy.recommended_action', label: '建議動作' },
    ],
  },
  'risk.conflicts': {
    id: 'risk.conflicts',
    api: '/v1/reports/:id',
    fields: [
      { fieldPath: 'conflict.os_mismatch', label: 'OS 宣稱 vs 實際' },
      { fieldPath: 'conflict.open_ports', label: '開放端口異態' },
      { fieldPath: 'conflict.dns_leak', label: 'DNS 洩漏' },
      { fieldPath: 'conflict.webrtc', label: 'WebRTC 一致性' },
      { fieldPath: 'conflict.canvas_tampering', label: 'Canvas 防追蹤' },
      { fieldPath: 'conflict.geo', label: '地理一致性' },
    ],
  },
  'network.geo': {
    id: 'network.geo',
    api: '/v1/reports/:id、/v1/network/ip-reputation',
    fields: [
      { fieldPath: 'network.ip_address', label: '公網 IP' },
      { fieldPath: 'network.isp', label: 'ISP' },
      { fieldPath: 'network.ip_history_7d', label: '7 天 IP 活躍' },
      { fieldPath: 'network.webrtc_ip', label: 'WebRTC 本地 IP' },
      { fieldPath: 'network.dns_leak_list', label: 'DNS 洩漏清單' },
      { fieldPath: 'network.open_ports', label: '開放端口' },
      { fieldPath: 'geo.country_region_city', label: '地理資訊' },
      { fieldPath: 'time.timezone_matrix', label: '時區一致性' },
    ],
  },
  'hardware.fp': {
    id: 'hardware.fp',
    api: '/v1/devices',
    fields: [
      { fieldPath: 'hardware.gpu_vendor_renderer', label: 'GPU 製造商/型號' },
      { fieldPath: 'hardware.cpu_memory', label: 'CPU／RAM' },
      { fieldPath: 'hardware.screen', label: '螢幕/CSS Viewport' },
      { fieldPath: 'hardware.touch', label: '觸控支援' },
      { fieldPath: 'hardware.canvas_hash', label: 'Canvas Hash' },
      { fieldPath: 'hardware.webgl_hash', label: 'WebGL Hash' },
      { fieldPath: 'hardware.audio_hash', label: 'Audio Hash' },
      { fieldPath: 'hardware.fonts_hash', label: 'Fonts Hash' },
    ],
  },
  'browser.env': {
    id: 'browser.env',
    api: '/v1/reports/:id',
    fields: [
      { fieldPath: 'browser.name_version', label: '瀏覽器／版本' },
      { fieldPath: 'browser.os_platform', label: 'OS／Platform' },
      { fieldPath: 'browser.ua_header', label: 'UA Header' },
      { fieldPath: 'browser.ua_js', label: 'JS UA' },
      { fieldPath: 'browser.languages', label: '語言設定' },
      { fieldPath: 'browser.fonts', label: '字體列表' },
      { fieldPath: 'browser.incognito', label: '無痕模式' },
      { fieldPath: 'browser.plugins', label: '外掛狀態' },
    ],
  },
  'raw.payload': {
    id: 'raw.payload',
    api: '/v1/reports/:id',
    fields: [
      { fieldPath: 'raw.schema_version', label: 'Schema 版本' },
      { fieldPath: 'raw.sdk_version', label: 'SDK 版本' },
      { fieldPath: 'raw.json_payload', label: 'Raw JSON' },
      { fieldPath: 'raw.consent_status', label: '同意狀態' },
      { fieldPath: 'raw.retention_until', label: '保留期限' },
    ],
  },
  'governance.audit': {
    id: 'governance.audit',
    api: '/v1/audit-logs',
    fields: [
      { fieldPath: 'governance.actor', label: '操作者' },
      { fieldPath: 'governance.action', label: '動作' },
      { fieldPath: 'governance.target', label: '目標' },
      { fieldPath: 'governance.timestamp', label: '時間' },
      { fieldPath: 'governance.reason', label: '原因' },
    ],
  },
};

export function moduleDataRef(id: string): ModuleDataRef | undefined {
  return MODULE_DATA[id];
}
