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

    test('should open rule management page (/rule) and navigate to rule edit page', async ({ page }) => {
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

        // 3. ルール編集ページ (/rule/edit) への遷移
        await page.waitForURL('**/rule/edit');
        await expect(page).toHaveURL(/\/rule\/edit(\?.*)?$/);

        // 4. 新規ルール作成ページのヘッダー確認
        await expect(page.locator('h1')).toContainText('新規自動録画ルール');

        // 5. 検索条件セクションの確認
        await expect(page.getByPlaceholder(/葬送のフリーレン/)).toBeVisible();

        // 6. 各セクション見出しの確認 (縦長レイアウト)
        await expect(page.getByRole('heading', { name: /検索条件/ })).toBeVisible();
        await expect(page.getByRole('heading', { name: /放送局/ })).toBeVisible();
        await expect(page.getByRole('heading', { name: /予約設定/ })).toBeVisible();
        await expect(page.getByRole('heading', { name: /保存先ストレージ/ })).toBeVisible();
        await expect(page.getByRole('heading', { name: /自動エンコード/ })).toBeVisible();

        // 7. キャンセルでルール一覧に戻る
        const cancelBtn = page.getByRole('button', { name: 'キャンセル' });
        await cancelBtn.click();
        await page.waitForURL('**/rule');
        await expect(page.locator('h1')).toContainText('自動録画ルール');

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});
