import { buildReport } from '@shieldscan/browser-sdk';
import type {
  AnalysisIssue,
  ConsentMode,
  EnvironmentReport,
  NormalizedSignal,
} from '@shieldscan/core-schema';
import {
  defaultRules,
  ScoringEngine,
  type ScoreResult,
  type ScoringProfile,
} from '@shieldscan/scoring-engine';

export const DEFAULT_PROFILE: ScoringProfile = {
  profileId: 'privacy-default',
  weights: {
    privacyExposure: 100,
    authenticity: 100,
    automationRisk: 100,
    networkTrust: 100,
  },
  thresholds: {
    allow: 70,
    review: 60,
    challenge: 50,
    block: 30,
  },
};

function findSignal(signals: NormalizedSignal[], key: string): NormalizedSignal | undefined {
  return signals.find((s) => s.key === key);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Phase 1 本地一致性分析（預覽用）。
 *
 * 正式風險判斷以 Server-side 分析引擎為準；這裡只做前端可得的
 * 一致性檢查：Canvas 篡改、UA vs Client Hints OS 不一致、WebRTC 本地 IP。
 */
export async function analyzeSignals(
  signals: NormalizedSignal[],
  consent: { mode: ConsentMode; retentionDays?: number },
): Promise<{ report: EnvironmentReport; score: ScoreResult; issues: AnalysisIssue[] }> {
  const issues: AnalysisIssue[] = [];

  const canvas = asRecord(findSignal(signals, 'canvas')?.value);
  if (canvas.isTampered === true) {
    issues.push({
      id: crypto.randomUUID(),
      type: 'canvas_tampered',
      severity: 'low',
      description: '偵測到 Canvas API 被修改，可能是 Brave 等隱私瀏覽器的保護機制',
      evidence: { isTampered: true },
    });
  }

  const ua = asRecord(findSignal(signals, 'ua')?.value);
  const clientHints = asRecord(findSignal(signals, 'clientHints')?.value);
  const uaText = String(ua.userAgent ?? '');
  const chPlatform = String(clientHints.platform ?? '');

  const uaOsFamily =
    /Android/i.test(uaText) && !/Windows/i.test(uaText)
      ? 'Android'
      : /Windows/i.test(uaText)
        ? 'Windows'
        : /iPhone|iPad/i.test(uaText)
          ? 'iOS'
          : /Macintosh|Mac OS X/i.test(uaText)
            ? 'macOS'
            : /Linux/i.test(uaText)
              ? 'Linux'
              : '';

  if (chPlatform && uaOsFamily && chPlatform !== uaOsFamily) {
    issues.push({
      id: crypto.randomUUID(),
      type: 'os_mismatch',
      severity: 'high',
      description: 'User-Agent 宣稱的作業系統與 Client Hints 回報的平台不一致',
      evidence: { uaOs: uaOsFamily, clientHintsPlatform: chPlatform },
    });
  }

  const webrtc = asRecord(findSignal(signals, 'webrtc')?.value);
  const localIps = Array.isArray(webrtc.localIps) ? (webrtc.localIps as string[]) : [];
  if (localIps.length > 0) {
    issues.push({
      id: crypto.randomUUID(),
      type: 'webrtc_local_ip',
      severity: 'info',
      description: 'WebRTC 回報了本地 IP（是否為洩漏需與 Server 端公網 IP 比對）',
      evidence: { localIps },
    });
  }

  const report = buildReport(signals, { consent });
  report.issues = issues;

  const engine = new ScoringEngine();
  for (const rule of defaultRules()) engine.registerRule(rule);
  const score = await engine.calculate(report, issues, DEFAULT_PROFILE);

  // 本地預覽分數：四維分數以最終分為基準，automationRisk 反向呈現。
  report.scores = {
    privacyExposure: score.finalScore,
    authenticity: score.finalScore,
    automationRisk: 100 - score.finalScore,
    networkTrust: score.finalScore,
  };

  return { report, score, issues };
}
