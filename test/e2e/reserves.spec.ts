import { test, expect } from '@playwright/test';

test.describe('Reserves and Manual Reserve Pages', () => {
    test('should display reserves list, filter tabs, and navigate to manual reserve page', async ({ page }) => {
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

        // 1. 予約一覧ページ
        await page.goto('/reserves');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1')).toContainText('予約一覧');

        // 2. フィルタタブ（すべて、重複、競合など）
        await expect(page.getByRole('button', { name: /すべて/ })).toBeVisible();

        // 3. 手動予約追加ボタンをクリックして手動予約ページへ遷移
        const manualReserveBtn = page.getByRole('button', { name: /手動予約/ });
        await expect(manualReserveBtn).toBeVisible();
        await manualReserveBtn.click();
        await page.waitForURL(/\/reserves\/manual/);

        // 4. 手動予約フォームの各要素確認
        await expect(page.locator('h1')).toContainText('時間指定手動予約');
        const nameInput = page.getByPlaceholder(/深夜アニメ/);
        await expect(nameInput).toBeVisible();
        await nameInput.fill('テスト予約');
        await expect(nameInput).toHaveValue('テスト予約');

        // 5. エラーゼロの検証
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});
