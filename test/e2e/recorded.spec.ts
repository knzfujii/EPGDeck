import { test, expect } from '@playwright/test';

test.describe('Recorded List Page (/recorded)', () => {
    test('should display recorded items, filter controls, view toggles, and navigate to details', async ({ page }) => {
        const consoleErrors: string[] = [];
        const pageErrors: string[] = [];

        page.on('console', msg => {
            if (msg.type() === 'error') {
                const text = msg.text();
                if (!text.includes('chrome-extension://') && !text.includes('favicon.ico')) {
                    consoleErrors.push(text);
                }
            }
        });
        page.on('pageerror', err => {
            pageErrors.push(err.message);
        });

        await page.goto('/recorded');
        await page.waitForLoadState('networkidle');

        // 1. ヘッダーとタイトル
        await expect(page.locator('h1')).toContainText('録画済み一覧');

        // 2. 検索バーとフィルタ
        const searchInput = page.getByPlaceholder('録画を検索...');
        await expect(searchInput).toBeVisible();
        await searchInput.fill('NHK');
        await expect(searchInput).toHaveValue('NHK');
        await searchInput.clear();

        // 3. 表示切り替え (カード / テーブル)
        const viewModeButtons = page.locator('button[title*="表示"]');
        const viewBtnCount = await viewModeButtons.count();
        if (viewBtnCount > 0) {
            await viewModeButtons.first().click();
        }

        // 4. 録画カードから詳細ページへの遷移検証
        const detailLink = page.locator('a[href*="/recorded/detail"]').first();
        const hasRecordedItem = await detailLink.isVisible().catch(() => false);

        if (hasRecordedItem) {
            await detailLink.click();
            await page.waitForURL(/\/recorded\/detail/);

            // 詳細ページの要素確認
            await expect(page.locator('h1')).toBeVisible();
            await expect(page.getByRole('button', { name: /再生する/ })).toBeVisible();
            await expect(page.getByRole('button', { name: /エンコード追加/ })).toBeVisible();
        }

        // 5. エラーゼロの検証
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});
