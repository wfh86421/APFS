'use client';

import { useEffect, useRef, useState } from 'react';
import type { EnvironmentReport, NormalizedSignal } from '@shieldscan/core-schema';
import type { ScoreResult } from '@shieldscan/scoring-engine';
import { submitReport, type ReportSubmissionResult } from '../lib/api';
import ConsentBanner, {
  loadConsent,
  saveConsent,
  type ConsentState,
} from '../components/consent-banner';
import ReportView from '../components/report-view';
import ScanPanel from '../components/scan-panel';
import { analyzeSignals } from '../lib/analyze';
import type { HomeConfig } from '../modules/homepage';
import { loadHomeConfig } from '../modules/homepage';

interface ScanResult {
  report: EnvironmentReport;
  score: ScoreResult;
  elapsedMs: number;
  policy?: ReportSubmissionResult['policy'];
  network?: ReportSubmissionResult['network'];
  analysisSource: 'local' | 'server';
  warning?: string;
}

export default function Home() {
  // 初始化固定為 local-only，避免 server/client hydration mismatch；
  // 儲存的同意選擇在 mount 後再讀取。
  const [consent, setConsent] = useState<ConsentState>({ mode: 'local-only' });
  const consentRef = useRef(consent);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [home, setHome] = useState<HomeConfig | null>(null);

  useEffect(() => {
    setConsent(loadConsent());
    setHome(loadHomeConfig());
  }, []);

  useEffect(() => {
    consentRef.current = consent;
    saveConsent(consent);
  }, [consent]);

  const handleComplete = async (signals: NormalizedSignal[], elapsedMs: number) => {
    const consent = consentRef.current;
    const { report, score } = await analyzeSignals(signals, consent);
    const base: ScanResult = { report, score, elapsedMs, analysisSource: 'local' };

    // local-only：一切留在本機；standard / stored：上傳伺服器並採用伺服器分析。
    if (consent.mode !== 'local-only') {
      try {
        const server = await submitReport(report);
        report.scores = {
          privacyExposure: server.score.finalScore,
          authenticity: server.score.finalScore,
          automationRisk: 100 - server.score.finalScore,
          networkTrust: server.score.finalScore,
        };
        report.raw = { ...(report.raw as object | undefined), network: server.network };
        setResult({
          ...base,
          report,
          score: server.score,
          policy: server.policy,
          network: server.network,
          analysisSource: 'server',
        });
      } catch (err) {
        setResult({
          ...base,
          warning: `伺服器分析失敗（${
            err instanceof Error ? err.message : String(err)
          }），顯示本機預覽分數`,
        });
      }
      return;
    }

    setResult(base);
  };

  const handleExport = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result.report, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `shieldscan-report-${result.report.reportId.slice(0, 8)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const blockState = (id: string) => {
    const block = home?.blocks.find((item) => item.id === id);
    return { visible: block?.visible ?? true, enabled: block?.enabled ?? true };
  };
  const contentOn = (id: string) => {
    const state = blockState(id);
    return state.visible && state.enabled;
  };
  const reportSections = {
    score: contentOn('result.score'),
    issues: contentOn('result.issues'),
    hardware: contentOn('result.hardware'),
    browser: contentOn('result.browser'),
    network: contentOn('result.network'),
    next: contentOn('result.next'),
  };

  return (
    <main>
      {contentOn('home.header') && (
        <header>
          <h1>🛡️ ShieldScan 隱盾檢測</h1>
          <p className="subtitle">
            一站式瀏覽器指紋與網路環境安全檢測：即時隱私評分、風險預警與環境一致性驗證。
          </p>
          <p style={{ margin: '0 0 16px' }}>
            <a href="/demo/login-risk">登入風控 Demo</a>・
            <a href="/register">API 自助註冊</a>・
            <a href="/admin/overview">企業後台</a>
          </p>
        </header>
      )}

      {contentOn('home.consent') && <ConsentBanner value={consent} onChange={setConsent} />}
      {contentOn('home.scan') && <ScanPanel consent={consent} onComplete={handleComplete} />}

      {result && (
        <ReportView
          report={result.report}
          score={result.score}
          elapsedMs={result.elapsedMs}
          policy={result.policy}
          network={result.network}
          analysisSource={result.analysisSource}
          warning={result.warning}
          onExport={handleExport}
          sections={reportSections}
        />
      )}

      {contentOn('home.footer') && (
        <footer className="muted" style={{ marginTop: 32, fontSize: 13 }}>
          ShieldScan Phase 1 MVP — 本地分析預覽。正式風險判斷由 Server 端分析引擎提供。
          <span style={{ marginLeft: 16 }}>
            <a href="/register">API 自助註冊</a>・
            <a href="/pricing">定價</a>・
            <a href="/privacy">隱私政策</a>
          </span>
        </footer>
      )}
    </main>
  );
}
