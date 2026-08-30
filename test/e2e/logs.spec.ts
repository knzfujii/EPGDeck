import { test, expect } from '@playwright/test';

test.describe('System Logs Page (/logs)', () => {
    test('should navigate to logs page without any console or runtime errors', async ({ page }) => {
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

        // 1. トップページからアクセス
        await page.goto('/');

        // 2. サイドバーの「システムログ」リンクをクリック
        const logsNavLink = page.getByRole('button', { name: 'システムログ' });
        await expect(logsNavLink).toBeVisible();
        await logsNavLink.click();

        // 3. /logs への遷移とタイトルの確認
        await expect(page.locator('h1')).toContainText('システムログ');
        await expect(page.getByText('Console Output')).toBeVisible();

        // 4. コンソールエラー・未捕捉エラーがゼロであることを検証
        expect(pageErrors, `Page threw errors: ${pageErrors.join(', ')}`).toEqual([]);
        expect(consoleErrors, `Console logged errors: ${consoleErrors.join(', ')}`).toEqual([]);
    });

    test('should display log filters, control buttons, and handle user interactions', async ({ page }) => {
        await page.goto('/logs');

        // ヘッダーとステータスの確認
        await expect(page.locator('h1')).toContainText('システムログ');
        const followButton = page.getByRole('button', { name: /追尾/ });
        await expect(followButton).toBeVisible();
        await expect(followButton).toContainText('追尾中');

        // フィルタコントロールの確認
        const searchInput = page.getByPlaceholder('ログを検索...');
        await expect(searchInput).toBeVisible();

        const levelSelect = page.locator('select').first();
        await expect(levelSelect).toBeVisible();

        // 検索入力のインタラクション
        await searchInput.fill('system');
        await expect(searchInput).toHaveValue('system');
        await searchInput.clear();

        // 自動スクロール（追尾）トグル
        const initialFollowText = (await followButton.innerText()).trim();
        await followButton.click();
        const toggledFollowText = (await followButton.innerText()).trim();
        expect(toggledFollowText).not.toBe(initialFollowText);
        await followButton.click();
        const restoredFollowText = (await followButton.innerText()).trim();
        expect(restoredFollowText).toBe(initialFollowText);

        // 画面クリアと再取得
        const clearButton = page.getByTitle('画面上のログを消去');
        await expect(clearButton).toBeVisible();
        await clearButton.click();

        await expect(page.getByText('表示するログがありません')).toBeVisible();

        const refreshButton = page.getByTitle('ログを再取得');
        await expect(refreshButton).toBeVisible();
        await refreshButton.click();

        // コピーボタンの動作確認（クリックしてコピー完了状態とスナックバーの表示を確認）
        const copyButton = page.getByTitle('表示中のログをコピー');
        await expect(copyButton).toBeVisible();
        await copyButton.click();
        await expect(page.getByText('件のログをコピーしました')).toBeVisible();
        await expect(copyButton).toContainText('コピー完了');

        // ダウンロードボタンの存在確認
        await expect(page.getByTitle('ログファイル全体をダウンロード')).toBeVisible();
    });

    test('should stream access logs in real-time when API requests occur', async ({ page }) => {
        await page.goto('/logs');
        await expect(page.locator('h1')).toContainText('システムログ');

        // 1. Live バッジの確認
        await expect(page.getByText('Live', { exact: true })).toBeVisible({ timeout: 5000 });

        // 2. ブラウザ側から API リクエストを発行（Hono access log が発生する）
        await page.evaluate(async () => {
            await fetch('/api/version');
        });

        // 3. ログ画面に '/api/version' のログ行がリアルタイムに表示されることを検証
        await expect(page.getByText('/api/version').first()).toBeVisible({ timeout: 5000 });
    });
});
