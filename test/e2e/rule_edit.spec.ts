import { test, expect } from '@playwright/test';

test.describe('Rule Edit Page (/rule/edit)', () => {
    test('should render all sections of the rule edit page', async ({ page }) => {
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

        await page.goto('/rule/edit');
        await page.waitForLoadState('networkidle');

        // 1. 新規作成ページのヘッダー
        await expect(page.locator('h1')).toContainText('新規自動録画ルール');

        // 2. 各セクション見出し (縦長レイアウト)
        await expect(page.getByRole('heading', { name: /検索条件/ })).toBeVisible();
        await expect(page.getByRole('heading', { name: /放送局/ })).toBeVisible();
        await expect(page.getByRole('heading', { name: /予約設定/ })).toBeVisible();
        await expect(page.getByRole('heading', { name: /保存先ストレージ/ })).toBeVisible();
        await expect(page.getByRole('heading', { name: /自動エンコード/ })).toBeVisible();

        // 3. 検索条件フォーム
        await expect(page.getByPlaceholder(/葬送のフリーレン/)).toBeVisible();
        await expect(page.getByPlaceholder(/再放送/)).toBeVisible();

        // 4. 予約設定のチェックボックス
        await expect(page.getByText('このルールを有効化する')).toBeVisible();
        await expect(page.getByText('重複録画を回避する')).toBeVisible();
        await expect(page.getByText('末尾切れを許可する')).toBeVisible();

        // 5. 保存先ストレージ
        await expect(page.getByText('親保存先ストレージ')).toBeVisible();
        await expect(page.getByText('保存サブディレクトリ')).toBeVisible();
        await expect(page.locator('#rule-filename-format')).toBeVisible();

        // 6. 自動エンコード設定 (3つ)
        await expect(page.getByText('エンコード設定 1')).toBeVisible();
        await expect(page.getByText('エンコード設定 2')).toBeVisible();
        await expect(page.getByText('エンコード設定 3')).toBeVisible();

        // 7. 操作ボタン
        await expect(page.getByRole('button', { name: '新規ルールを作成する' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'キャンセル' })).toBeVisible();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should prefill search conditions from query params', async ({ page }) => {
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

        // 検索画面から渡されるクエリパラメータを再現
        await page.goto('/rule/edit?keyword=%E3%83%8B%E3%83%A5%E3%83%BC%E3%82%B9&name=1&description=1&genre=0');
        await page.waitForLoadState('networkidle');

        // キーワードがプリフィルされている
        const keywordInput = page.getByPlaceholder(/葬送のフリーレン/);
        await expect(keywordInput).toHaveValue('ニュース');

        // ジャンルがプリフィルされている (ニュース = 0)
        await expect(page.locator('#rule-genre')).toHaveValue('0');

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should navigate back to rule list on cancel', async ({ page }) => {
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

        await page.goto('/rule/edit');
        await page.waitForLoadState('networkidle');

        const cancelBtn = page.getByRole('button', { name: 'キャンセル' });
        await cancelBtn.click();
        await page.waitForURL('**/rule');
        await expect(page.locator('h1')).toContainText('自動録画ルール');

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});