import { test, expect } from '@playwright/test';

test.describe('Dashboard Page (/)', () => {
    test('should display overview metrics and integrated storage usage cards', async ({ page }) => {
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

        await page.goto('/');

        // 1. 予約リスト・録画リストの見出し
        const main = page.locator('main');
        await expect(main.getByRole('heading', { name: '予約リスト' })).toBeVisible();
        await expect(main.getByRole('heading', { name: '録画リスト' })).toBeVisible();

        // 2. ダッシュボードに統合されたストレージ容量カード
        const storageCardBtn = main.getByRole('button', { name: /ストレージ容量/ });
        await expect(storageCardBtn).toBeVisible();
        await expect(page.getByText(/\d+ ドライブ/)).toBeVisible();

        // アコーディオンを展開して詳細数値を検証
        await storageCardBtn.click();
        await expect(page.getByText(/使用:/).first()).toBeVisible();
        await expect(page.getByText(/空き:/).first()).toBeVisible();
        await expect(page.getByText(/合計:/).first()).toBeVisible();

        // 3. サイドバーに単独の「ストレージ」メニュー項目が存在しないこと（ダッシュボード統合による整理）
        const sidebar = page.locator('aside');
        await expect(sidebar.getByRole('button', { name: 'ストレージ' })).toHaveCount(0);

        // 4. エラーゼロの検証
        expect(pageErrors, `Page errors: ${pageErrors.join(', ')}`).toEqual([]);
        expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toEqual([]);
    });
});
