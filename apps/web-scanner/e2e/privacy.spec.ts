import { expect, test } from '@playwright/test';

test.describe('隱私政策頁', () => {
  test('載入並包含三種同意模式說明', async ({ page }) => {
    await page.goto('/privacy');

    await expect(page.getByRole('heading', { name: '隱私政策' })).toBeVisible();
    await expect(page.getByText('僅本機（local-only）')).toBeVisible();
    await expect(page.getByText('標準（standard）')).toBeVisible();
    await expect(page.getByText('保留分析（stored）')).toBeVisible();
    await expect(page.getByRole('link', { name: '← 返回掃描頁' })).toHaveAttribute('href', '/');
  });
});
