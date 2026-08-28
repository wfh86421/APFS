import { expect, test } from '@playwright/test';

test.describe('ShieldScan 檢測網站（Phase 1 E2E）', () => {
  test('首頁載入：標題、同意選項與掃描按鈕', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /ShieldScan 隱盾檢測/ })).toBeVisible();
    await expect(page.getByText('資料使用同意')).toBeVisible();
    await expect(page.getByLabel('僅本機（local-only）')).toBeChecked();
    await expect(page.getByRole('button', { name: '開始掃描' })).toBeVisible();
    await expect(page.getByRole('link', { name: '隱私政策' })).toHaveAttribute('href', '/privacy');
  });

  test('同意模式選擇會持久化（localStorage）', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('保留分析（stored）').check();
    await expect(page.getByLabel('保留分析（stored）')).toBeChecked();

    // 重新載入後仍保持選擇
    await page.reload();
    await expect(page.getByLabel('保留分析（stored）')).toBeChecked();

    const stored = await page.evaluate(() => window.localStorage.getItem('shieldscan.consent'));
    expect(stored).toContain('"mode":"stored"');
  });

  test('完整掃描流程：進度列 → 分區報告 → 四維評分', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: '開始掃描' }).click();

    // 進度列出現（10 個模組）；完成率 ≥ 90%（Phase 1 驗證指標）
    await expect(page.getByText(/^(✅|❌)$/)).toHaveCount(10, { timeout: 20_000 });
    const completedCount = await page.getByText('✅').count();
    expect(completedCount, `掃描完成率 ${completedCount}/10 應 ≥ 90%`).toBeGreaterThanOrEqual(9);

    // 分區報告出現
    await expect(page.getByRole('heading', { name: '隱私評分' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '異常與風險（Issues）' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '硬體指紋（Hardware）' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '瀏覽器環境（Browser）' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '網路環境（Network）' })).toBeVisible();

    // 評分數字與四維分數
    await expect(page.locator('.score-number')).toBeVisible();
    await expect(page.getByText('隱私暴露（越低越好）')).toBeVisible();
    await expect(page.getByText('環境真實性')).toBeVisible();
    await expect(page.getByText('自動化風險')).toBeVisible();
    await expect(page.getByText('網路信任')).toBeVisible();

    // 報告 ID 有值
    await expect(page.locator('dl.kv')).toContainText('報告 ID');
  });

  test('掃描耗時低於 3 秒（P95）', async ({ page }) => {
    await page.goto('/');

    const durations: number[] = [];
    const RUNS = 3;

    for (let i = 0; i < RUNS; i++) {
      const started = Date.now();
      await page.getByRole('button', { name: '開始掃描' }).click();
      await expect(page.getByRole('button', { name: /掃描中/ })).toBeVisible();
      await expect(page.getByRole('button', { name: '開始掃描' })).toBeVisible({
        timeout: 20_000,
      });
      durations.push(Date.now() - started);
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
    const p95 = sorted[p95Index] ?? 0;

    // eslint-disable-next-line no-console
    console.log(`scan durations(ms): ${durations.join(', ')} | p95=${p95}`);

    expect(p95, `P95 掃描耗時 ${p95}ms 應 < 3000ms`).toBeLessThan(3000);
  });

  test('JSON 匯出：下載完整 EnvironmentReport', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '開始掃描' }).click();
    await expect(page.getByRole('heading', { name: '隱私評分' })).toBeVisible({
      timeout: 20_000,
    });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '匯出 JSON' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^shieldscan-report-[0-9a-f]{8}\.json$/);

    const path = await download.path();
    const fs = await import('node:fs/promises');
    const raw = await fs.readFile(path, 'utf8');
    const report = JSON.parse(raw);
    expect(report.reportId).toBeTruthy();
    expect(report.schemaVersion).toBe('0.1.0');
    expect(report.signals.length).toBeGreaterThanOrEqual(10);
    expect(report.consent.mode).toBeTruthy();
    expect(report.sdk.name).toBe('@shieldscan/browser-sdk');
  });

  test('standard 模式會上傳報告並顯示伺服器分析', async ({ page }) => {
    let posted: unknown = null;
    await page.route('**/v1/reports', async (route) => {
      posted = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          reportId: 'e2e-0000-0000-0000-000000000001',
          schemaVersion: '0.1.0',
          score: {
            finalScore: 90,
            maxScore: 100,
            grade: 'A+',
            deductions: [],
            riskLevel: 'low',
          },
          policy: 'allow',
          network: {
            ip: '127.0.0.1',
            geo: null,
            proxy: false,
            vpn: false,
            tor: false,
            datacenter: false,
            riskLevel: 'low',
            webrtc: { consistency: 'unknown', localIps: [], publicIp: '127.0.0.1' },
          },
        }),
      });
    });

    await page.goto('/');
    await page.getByLabel('標準（standard）').check();
    await page.getByRole('button', { name: '開始掃描' }).click();

    await expect(page.getByRole('heading', { name: '隱私評分' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('伺服器分析')).toBeVisible();

    expect(posted).toBeTruthy();
    const body = posted as { consent?: { mode?: string }; signals?: unknown[] };
    expect(body.consent?.mode).toBe('standard');
    expect((body.signals as unknown[]).length).toBeGreaterThanOrEqual(10);
  });
});
