import type {
  AnalysisIssue,
  EnvironmentReport,
  PolicyDecision,
  ScoreBundle,
} from '@shieldscan/core-schema';

export interface PolicyInput {
  report: EnvironmentReport;
  scores: ScoreBundle;
  issues: AnalysisIssue[];
  scenario: 'scanner' | 'login' | 'payment' | 'streaming' | 'game' | 'custom';
}

export interface PolicyResult {
  decision: PolicyDecision;
  reason: string;
  challenge?: {
    type: 'captcha' | 'otp' | 'device_check' | 'app_attest';
  };
}

/**
 * 政策插件：把分數轉成商業決策。
 * 例：登入風控、註冊風控、支付風控、看劇播放前檢查、遊戲防作弊。
 */
export interface PolicyPlugin {
  readonly id: string;
  readonly scenario: PolicyInput['scenario'];
  decide(input: PolicyInput): Promise<PolicyResult>;
}

/** 通用門檻政策：依綜合風險分數決定 allow / review / challenge / block。 */
export class ThresholdPolicy implements PolicyPlugin {
  readonly id = 'policy.threshold';

  constructor(
    readonly scenario: PolicyInput['scenario'],
    private readonly thresholds: { review: number; challenge: number; block: number },
  ) {}

  async decide(input: PolicyInput): Promise<PolicyResult> {
    const riskScore = input.scores.automationRisk + input.scores.networkTrust;

    if (riskScore >= this.thresholds.block) {
      return { decision: 'block', reason: '風險分數超過封鎖門檻' };
    }
    if (riskScore >= this.thresholds.challenge) {
      return {
        decision: 'challenge',
        reason: '風險分數超過挑戰門檻，要求二次驗證',
        challenge: { type: 'device_check' },
      };
    }
    if (riskScore >= this.thresholds.review) {
      return { decision: 'review', reason: '風險分數超過審查門檻，轉人工/佇列審查' };
    }
    return { decision: 'allow', reason: '風險分數低於門檻' };
  }
}
