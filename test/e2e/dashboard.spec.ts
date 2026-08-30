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

        // 1. 予約中・録画済みの概要カード
        const main = page.locator('main');
        await expect(main.getByRole('button', { name: /予約中/ })).toBeVisible();
        await expect(main.getByRole('button', { name: /録画済み/ })).toBeVisible();

        // 2. ダッシュボードに統合されたストレージ容量カード
        await expect(main.getByRole('heading', { name: 'ストレージ容量' })).toBeVisible();
        await expect(page.getByText(/全 \d+ ドライブ/)).toBeVisible();
        await expect(page.getByText(/使用中/).first()).toBeVisible();
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

