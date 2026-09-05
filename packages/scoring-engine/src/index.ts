import type { AnalysisIssue, EnvironmentReport, ScoreBundle } from '@shieldscan/core-schema';

export interface ScoringRule {
  id: string;
  name: string;
  category: string;
  severity: 'info' | 'warning' | 'critical';
  /** 雙軌制：此規則影響隱私風險或欺詐風險。 */
  track: 'privacy' | 'fraud';
  deduction: number;
  description: string;
  evaluate(report: EnvironmentReport, issues: AnalysisIssue[]): boolean;
}

/** 產業情境的評分 Profile：不同產業不要共用同一套權重。 */
export interface ScoringProfile {
  profileId: string;
  weights: Record<string, number>;
  thresholds: {
    allow: number;
    review: number;
    challenge: number;
    block: number;
  };
}

export interface ScoreResult {
  finalScore: number;
  maxScore: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  privacyScore: number;
  fraudScore: number;
  deductions: Array<{
    ruleId: string;
    points: number;
    reason: string;
  }>;
  privacyDeductions: Array<{ ruleId: string; points: number; reason: string }>;
  fraudDeductions: Array<{ ruleId: string; points: number; reason: string }>;
  explanations: Array<{
    ruleId: string;
    track: 'privacy' | 'fraud';
    severity: ScoringRule['severity'];
    points: number;
    reason: string;
  }>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export class ScoringEngine {
  private rules: ScoringRule[] = [];

  registerRule(rule: ScoringRule): void {
    this.rules.push(rule);
  }

  async calculate(
    report: EnvironmentReport,
    issues: AnalysisIssue[],
    profile: ScoringProfile,
  ): Promise<ScoreResult> {
    const deductions = this.rules
      .filter((rule) => rule.evaluate(report, issues))
      .map((rule) => ({
        ruleId: rule.id,
        points: rule.deduction,
        reason: rule.description,
      }));

    const totalDeduction = deductions.reduce((sum, d) => sum + d.points, 0);
    const finalScore = Math.max(0, 100 - totalDeduction);
    const privacyDeductions = this.rules
      .filter((rule) => rule.track === 'privacy' && rule.evaluate(report, issues))
      .map((rule) => ({
        ruleId: rule.id,
        points: rule.deduction,
        reason: rule.description,
      }));
    const fraudDeductions = this.rules
      .filter((rule) => rule.track === 'fraud' && rule.evaluate(report, issues))
      .map((rule) => ({
        ruleId: rule.id,
        points: rule.deduction,
        reason: rule.description,
      }));
    const privacyScore = Math.max(0, 100 - privacyDeductions.reduce((sum, d) => sum + d.points, 0));
    const fraudScore = Math.max(0, 100 - fraudDeductions.reduce((sum, d) => sum + d.points, 0));

    return {
      finalScore,
      maxScore: 100,
      grade: this.scoreToGrade(finalScore),
      deductions,
      privacyScore,
      fraudScore,
      privacyDeductions,
      fraudDeductions,
      explanations: deductions.map((d) => {
        const rule = this.rules.find((item) => item.id === d.ruleId);
        return {
          ruleId: d.ruleId,
          track: rule?.track ?? 'fraud',
          severity: rule?.severity ?? 'warning',
          points: d.points,
          reason: d.reason,
        };
      }),
      riskLevel: finalScore >= profile.thresholds.allow
        ? 'low'
        : finalScore >= profile.thresholds.review
          ? 'medium'
          : finalScore >= profile.thresholds.challenge
            ? 'high'
            : 'critical',
    };
  }

  private scoreToGrade(score: number): ScoreResult['grade'] {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'F';
  }
}

export function defaultRules(): ScoringRule[] {
  return [
    {
      id: 'canvas_tamper',
      name: 'Canvas 指紋篡改',
      category: 'privacy_protection',
      severity: 'info',
      track: 'privacy',
      deduction: 5,
      description: '瀏覽器對 Canvas API 進行了修改，可能是 Brave 等隱私瀏覽器的保護機制',
      evaluate: (r, issues) =>
        r.signals.some((s) => s.key === 'canvas.isTampered' && s.value === true) ||
        issues.some((i) => i.type === 'canvas_tampered'),
    },
    {
      id: 'os_mismatch',
      name: '作業系統不一致',
      category: 'spoofing',
      severity: 'warning',
      track: 'fraud',
      deduction: 5,
      description: 'User-Agent 宣稱的 OS 與實際檢測到的 Platform 不匹配',
      evaluate: (r) => r.issues.some((i) => i.type === 'os_mismatch'),
    },
    {
      id: 'dns_leak',
      name: 'DNS 洩漏',
      category: 'network_security',
      severity: 'warning',
      track: 'privacy',
      deduction: 10,
      description: '檢測到 DNS 洩漏，真實 ISP 的 DNS 伺服器被暴露',
      evaluate: (r) => r.issues.some((i) => i.type === 'dns_leak'),
    },
    {
      id: 'webrtc_leak',
      name: 'WebRTC IP 洩漏',
      category: 'network_security',
      severity: 'warning',
      track: 'privacy',
      deduction: 8,
      description: 'WebRTC 洩漏了本地 IP 地址',
      evaluate: (r) => r.issues.some((i) => i.type === 'webrtc_leak'),
    },
    {
      id: 'open_ports_ssh_rdp',
      name: '異常端口開放',
      category: 'network_security',
      severity: 'critical',
      track: 'fraud',
      deduction: 15,
      description: '檢測到 SSH(22) 或 RDP(3389) 端口開放，手機網路極不尋常',
      evaluate: (r) => r.issues.some((i) => i.type === 'unusual_open_ports'),
    },
    {
      id: 'bot_detected',
      name: '機器人特徵檢測',
      category: 'automation',
      severity: 'critical',
      track: 'fraud',
      deduction: 20,
      description: '檢測到自動化工具或機器人特徵',
      evaluate: (r) => r.issues.some((i) => i.type === 'bot_detected'),
    },
  ];
}
