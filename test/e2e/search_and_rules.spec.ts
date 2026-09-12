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

        // クエリパラメータの同期検証
        await expect(page).toHaveURL(/keyword=%E3%83%8B%E3%83%A5%E3%83%BC%E3%82%B9/);

        // 3. ルール作成ボタンの存在確認
        await expect(page.getByRole('button', { name: 'この条件でルール作成' })).toBeVisible();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should prefill search input and execute search from query params', async ({ page }) => {
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

        // クエリパラメータ付きでアクセス
        await page.goto('/search?keyword=%E3%83%8B%E3%83%A5%E3%83%BC%E3%82%B9');
        await page.waitForLoadState('networkidle');

        // 検索ボックスに値がセットされ、検索が自動実行されていることを検証
        const searchInput = page.getByPlaceholder(/番組名やキーワード/);
        await expect(searchInput).toHaveValue('ニュース');
        await expect(page.getByRole('button', { name: 'この条件でルール作成' })).toBeVisible();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should allow navigating back and forth across search history with browser back/forward', async ({ page }) => {
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

        const searchInput = page.getByPlaceholder(/番組名やキーワード/);
        const searchButton = page.getByRole('button', { name: '検索', exact: true });

        // 1回目の検索: 「ニュース」
        await searchInput.fill('ニュース');
        await searchButton.click();
        await expect(page).toHaveURL(/keyword=%E3%83%8B%E3%83%A5%E3%83%BC%E3%82%B9/);

        // 2回目の検索: 「アニメ」
        await searchInput.fill('アニメ');
        await searchButton.click();
        await expect(page).toHaveURL(/keyword=%E3%82%A2%E3%83%8B%E3%83%A1/);

        // ブラウザの戻るを実行 -> 「ニュース」の検索状態に復元
        await page.goBack();
        await expect(page).toHaveURL(/keyword=%E3%83%8B%E3%83%A5%E3%83%BC%E3%82%B9/);
        await expect(searchInput).toHaveValue('ニュース');

        // ブラウザの進むを実行 -> 「アニメ」の検索状態に復元
        await page.goForward();
        await expect(page).toHaveURL(/keyword=%E3%82%A2%E3%83%8B%E3%83%A1/);
        await expect(searchInput).toHaveValue('アニメ');

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

        // 1. ルール一覧ヘッダー
        await expect(page.locator('h1')).toContainText('ルール一覧');

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
        await expect(page.getByRole('heading', { name: /予約設定/ })).toBeVisible();
        await expect(page.getByRole('heading', { name: /保存先ストレージ/ })).toBeVisible();
        await expect(page.getByRole('heading', { name: /自動エンコード/ })).toBeVisible();

        // 詳細条件アコーディオンを展開して確認
        const detailBtn = page.getByRole('button', { name: /詳細条件/ });
        await expect(detailBtn).toBeVisible();
        await detailBtn.click();
        await expect(page.getByRole('heading', { name: /放送波・放送局/ })).toBeVisible();

        // 7. キャンセルでルール一覧に戻る
        const cancelBtn = page.getByRole('button', { name: 'キャンセル' });
        await cancelBtn.click();
        await page.waitForURL('**/rule');
        await expect(page.locator('h1')).toContainText('ルール一覧');

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});
