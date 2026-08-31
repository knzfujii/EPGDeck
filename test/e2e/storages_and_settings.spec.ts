import { test, expect } from '@playwright/test';

test.describe('Storages and Settings Pages', () => {
    test('should display storage drives and metrics on /storages', async ({ page }) => {
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

        await page.goto('/storages');
        await page.waitForLoadState('networkidle');

        // 1. ヘッダーとタイトル
        await expect(page.locator('h1')).toContainText('ストレージ容量');
        await expect(page.getByText(/全 \d+ ドライブ/)).toBeVisible();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should display settings options and save preferences on /settings', async ({ page }) => {
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

        await page.goto('/settings');
        await page.waitForLoadState('networkidle');

        // 1. ヘッダーとタイトル
        await expect(page.locator('h1')).toContainText('アプリケーション設定');
        await expect(page.getByRole('heading', { name: '外観・テーマ' })).toBeVisible();

        // 2. 半角表示チェックボックスの操作
        const halfWidthCheckbox = page.locator('input[type="checkbox"]').first();
        await expect(halfWidthCheckbox).toBeVisible();
        await halfWidthCheckbox.click();

        // 3. 設定保存ボタン
        const saveBtn = page.getByRole('button', { name: /保存/ });
        await expect(saveBtn).toBeVisible();
        await saveBtn.click();

        // 4. 保存成功トーストの確認
        await expect(page.getByText(/設定を保存しました/)).toBeVisible();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});
