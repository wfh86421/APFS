'use client';

import { useEffect, useRef, useState } from 'react';
import type { EnvironmentReport, NormalizedSignal } from '@shieldscan/core-schema';
import type { ScoreResult } from '@shieldscan/scoring-engine';
import ConsentBanner, {
  loadConsent,
  saveConsent,
  type ConsentState,
} from '../components/consent-banner';
import ReportView from '../components/report-view';
import ScanPanel from '../components/scan-panel';
import { analyzeSignals } from '../lib/analyze';

interface ScanResult {
  report: EnvironmentReport;
  score: ScoreResult;
  elapsedMs: number;
}

export default function Home() {
  const [consent, setConsent] = useState<ConsentState>(() => loadConsent());
  const consentRef = useRef(consent);
  const [result, setResult] = useState<ScanResult | null>(null);

  useEffect(() => {
    consentRef.current = consent;
    saveConsent(consent);
  }, [consent]);

  const handleComplete = async (signals: NormalizedSignal[], elapsedMs: number) => {
    const { report, score } = await analyzeSignals(signals, consentRef.current);
    setResult({ report, score, elapsedMs });
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

  return (
    <main>
      <header>
        <h1>🛡️ ShieldScan 隱盾檢測</h1>
        <p className="subtitle">
          一站式瀏覽器指紋與網路環境安全檢測：即時隱私評分、風險預警與環境一致性驗證。
        </p>
      </header>

      <ConsentBanner value={consent} onChange={setConsent} />
      <ScanPanel consent={consent} onComplete={handleComplete} />

      {result && (
        <ReportView
          report={result.report}
          score={result.score}
          elapsedMs={result.elapsedMs}
          onExport={handleExport}
        />
      )}

      <footer className="muted" style={{ marginTop: 32, fontSize: 13 }}>
        ShieldScan Phase 1 MVP — 本地分析預覽。正式風險判斷由 Server 端分析引擎提供。
      </footer>
    </main>
  );
}
