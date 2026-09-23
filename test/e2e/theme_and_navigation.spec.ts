import { test, expect } from '@playwright/test';

test.describe('Theme Rotation and Navigation Spec', () => {
    test('should cycle theme modes (auto -> light -> dark -> auto) from header button', async ({ page }) => {
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
        await page.waitForLoadState('networkidle');

        // テーマ切り替えボタンを取得
        const themeBtn = page.getByRole('button', { name: 'テーマ切り替え' });
        await expect(themeBtn).toBeVisible();

        // 1. 初期状態 (auto または保存値)
        const initialTitle = await themeBtn.getAttribute('title');
        expect(initialTitle).toContain('テーマ:');

        // 2. クリックしてライトモードへ
        await themeBtn.click();
        await expect(themeBtn).toHaveAttribute('title', /テーマ: ライト/);
        await expect(page.locator('html')).not.toHaveClass(/dark/);

        // 3. クリックしてダークモードへ
        await themeBtn.click();
        await expect(themeBtn).toHaveAttribute('title', /テーマ: ダーク/);
        await expect(page.locator('html')).toHaveClass(/dark/);

        // 4. クリックして自動（OS準拠）へ戻る
        await themeBtn.click();
        await expect(themeBtn).toHaveAttribute('title', /テーマ: 自動 \(OS準拠\)/);

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should not show Settings or Storages in navigation, and show 404 for removed routes', async ({ page }) => {
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
        await page.waitForLoadState('networkidle');

        // ナビゲーションメニューに「設定」や「ストレージ」のリンクが存在しないこと
        const settingsNav = page.getByRole('button', { name: '設定' });
        await expect(settingsNav).toHaveCount(0);

        // ダッシュボード上に統合されたストレージ容量が表示されていること
        await expect(page.getByRole('heading', { name: 'ストレージ容量' })).toBeVisible();

        // 廃止された /settings にアクセスした場合は 404 画面になること
        await page.goto('/settings');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('h1')).toContainText('404');

        // 廃止された /storages にアクセスした場合は 404 画面になること
        await page.goto('/storages');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('h1')).toContainText('404');

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should navigate through all main sidebar links seamlessly without runtime errors', async ({ page }) => {
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
        await page.waitForLoadState('networkidle');

        const navLinks = [
            { name: '放送中', url: /\/onair$/, expectedText: '放送中' },
            { name: '番組表', url: /\/guide$/, expectedSelector: 'select' },
            { name: '録画一覧', url: /\/recorded$/, expectedText: '録画一覧' },
            { name: '予約一覧', url: /\/reserves$/, expectedText: '予約一覧' },
            { name: '番組検索', url: /\/search$/, expectedText: '番組検索' },
            { name: 'ルール一覧', url: /\/rule$/, expectedText: 'ルール一覧' },
            { name: 'エンコード一覧', url: /\/encode$/, expectedText: 'エンコード一覧' },
            { name: 'システムログ', url: /\/logs$/, expectedText: 'システムログ' },
            { name: 'ダッシュボード', url: /\/$/, expectedSelector: 'h2:has-text("ストレージ容量")' },
        ];

        const nav = page.locator('nav');

        for (const link of navLinks) {
            const btn = nav.getByRole('button', { name: link.name });
            await expect(btn).toBeVisible();
            await btn.click();
            await page.waitForURL(link.url);
            if (link.expectedText) {
                await expect(page.locator('h1')).toContainText(link.expectedText);
            }
            if (link.expectedSelector) {
                await expect(page.locator(link.expectedSelector)).toBeVisible();
            }
        }

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});
