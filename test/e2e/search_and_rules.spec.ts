import { test, expect } from '@playwright/test';

test.describe('Search and Rules Management Pages', () => {
    test('should search programs and display search options on /search', async ({ page }) => {
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

        await page.goto('/search');
        await page.waitForLoadState('networkidle');

        // 1. ヘッダーと検索バー
        await expect(page.locator('h1')).toContainText('番組検索');
        const searchInput = page.getByPlaceholder(/番組名やキーワード/);
        await expect(searchInput).toBeVisible();

        // 2. 検索実行
        await searchInput.fill('ニュース');
        const searchButton = page.getByRole('button', { name: '検索', exact: true });
        await expect(searchButton).toBeVisible();
        await searchButton.click();

        // 3. ルール作成ボタンの存在確認
        await expect(page.getByRole('button', { name: 'この条件でルール作成' })).toBeVisible();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should open rule management page (/rule) and open rule edit modal', async ({ page }) => {
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

        await page.goto('/rule');
        await page.waitForLoadState('networkidle');

        // 1. ルール管理ヘッダー
        await expect(page.locator('h1')).toContainText('自動録画ルール');

        // 2. ルール新規作成ボタン
        const addRuleButton = page.getByRole('button', { name: /ルール追加|新規ルール/ }).first();
        await expect(addRuleButton).toBeVisible();
        await addRuleButton.click();

        // 3. ルール編集モーダルの確認
        await expect(page.getByRole('heading', { name: '新規自動録画ルールの作成' })).toBeVisible();

        // モーダルのタブ切り替え（検索条件、対象局、録画設定、エンコード）
        const channelsTab = page.getByRole('button', { name: /対象局|放送局/ });
        if (await channelsTab.isVisible().catch(() => false)) {
            await channelsTab.click();
        }

        const saveTab = page.getByRole('button', { name: /録画設定|保存先/ });
        if (await saveTab.isVisible().catch(() => false)) {
            await saveTab.click();
        }

        const encodeTab = page.getByRole('button', { name: /エンコード/ });
        if (await encodeTab.isVisible().catch(() => false)) {
            await encodeTab.click();
        }

        // キャンセルで閉じる
        const cancelBtn = page.getByRole('button', { name: 'キャンセル' });
        await cancelBtn.click();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});
