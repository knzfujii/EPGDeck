import { test, expect } from '@playwright/test';

test.describe('Guide Page (/guide)', () => {
    test('should restrict past date navigation on today and allow quick date selection up to +8 days', async ({ page }) => {
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

        await page.goto('/guide');

        // 1. 番組表のロード確認
        await expect(page.locator('select')).toBeVisible({ timeout: 10000 });

        // 2. 今日の状態では「前日」ボタンが disabled であること
        const prevBtn = page.getByTitle('前日');
        await expect(prevBtn).toBeDisabled();

        // 3. 日付セレクタ（select）の検証
        const dateSelect = page.locator('select');
        const options = await dateSelect.locator('option').allInnerTexts();
        expect(options.length).toBe(9); // 今日 + 8日 = 9日間
        expect(options[0]).toContain('今日');
        expect(options[1]).toContain('明日');

        // 4. 「翌日」ボタンをクリックして未来の日付へ進む
        const nextBtn = page.getByTitle('翌日');
        await expect(nextBtn).toBeEnabled();
        await nextBtn.click();

        // 5. 翌日に進んだ後は「前日」ボタンが有効化されること
        await expect(prevBtn).toBeEnabled();

        // 6. 「現在」ボタンをクリックすると今日に復帰すること
        const nowBtn = page.getByRole('button', { name: '現在' });
        await nowBtn.click();
        await expect(prevBtn).toBeDisabled();

        // 7. エラーゼロの検証
        expect(pageErrors, `Page errors: ${pageErrors.join(', ')}`).toEqual([]);
        expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toEqual([]);
    });
});

