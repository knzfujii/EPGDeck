import { test, expect } from '@playwright/test';

test.describe('Responsive & Multi-device Layout Tests (Mobile, Tablet, Desktop)', () => {
    // =========================================================================
    // 1. スマートフォン (Mobile: 390 x 844)
    // =========================================================================
    test.describe('Mobile Viewport (390 x 844)', () => {
        test.use({ viewport: { width: 390, height: 844 } });

        test('should hide PC sidebar and use mobile drawer navigation', async ({ page }) => {
            const consoleErrors: string[] = [];
            const pageErrors: string[] = [];
            page.on('console', msg => {
                if (msg.type() === 'error' && !msg.text().includes('chrome-extension://')) {
                    consoleErrors.push(msg.text());
                }
            });
            page.on('pageerror', err => pageErrors.push(err.message));

            await page.goto('/');
            await page.waitForLoadState('networkidle');

            // 1. PC 用 aside サイドバーが非表示であることを確認
            const pcSidebar = page.locator('aside');
            await expect(pcSidebar).not.toBeVisible();

            // 2. ヘッダーのハンバーガーメニューボタンをクリック
            const menuBtn = page.getByRole('button', { name: 'メニューを開閉' });
            await expect(menuBtn).toBeVisible();
            await menuBtn.click();

            // 3. モバイルドロワー (role="dialog") が開くことを確認
            const drawer = page.getByRole('dialog');
            await expect(drawer).toBeVisible();
            await expect(drawer.getByText('EPGDeck')).toBeVisible();

            // 4. ドロワー内の「録画一覧」リンクをタップして遷移
            const recordedNavLink = drawer.getByRole('button', { name: '録画一覧' });
            await expect(recordedNavLink).toBeVisible();
            await recordedNavLink.click();

            // 5. /recorded への遷移とドロワーの自動クローズを確認
            await page.waitForURL(/\/recorded/);
            await expect(drawer).not.toBeVisible();
            await expect(page.locator('h1')).toContainText('録画一覧');

            // 6. 再びドロワーを開き、閉じるボタンで閉じられることを確認
            await menuBtn.click();
            await expect(drawer).toBeVisible();
            const closeDrawerBtn = drawer.getByRole('button', { name: '閉じる', exact: true });
            await closeDrawerBtn.click();
            await expect(drawer).not.toBeVisible();

            expect(pageErrors).toEqual([]);
            expect(consoleErrors).toEqual([]);
        });

        test('should display mobile card list instead of table on /reserves', async ({ page }) => {
            const mockReserves = [
                {
                    id: 901,
                    programId: 1001,
                    channelId: 1,
                    name: 'モバイル予約アニメ番組',
                    description: 'スマホ画面でのカード表示テスト',
                    startAt: Date.now() + 3600000,
                    endAt: Date.now() + 7200000,
                    isRecording: false,
                    isConflict: false,
                },
            ];

            await page.route('**/api/reserves*', async route => {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ reserves: mockReserves, total: 1 }),
                });
            });

            await page.goto('/reserves');
            await page.waitForLoadState('networkidle');

            // モバイル用カードタイトルが表示されることを確認
            const mobileCard = page.locator('.program-title-dense', { hasText: 'モバイル予約アニメ番組' });
            await expect(mobileCard).toBeVisible();

            // モバイルカードをタップして詳細モーダルが開くことを確認
            await mobileCard.click();
            const modal = page.getByRole('dialog');
            await expect(modal).toBeVisible();
            await expect(modal.getByText('モバイル予約アニメ番組')).toBeVisible();

            // モーダルを閉じる
            await modal.getByRole('button', { name: 'モーダルを閉じる' }).click();
            await expect(modal).not.toBeVisible();
        });

        test('should handle floating action bar properly in mobile selection mode on /recorded', async ({ page }) => {
            const mockRecords = [
                {
                    id: 801,
                    channelId: 1,
                    name: 'スマホ用録画番組1',
                    startAt: Date.now() - 3600000,
                    endAt: Date.now(),
                    isRecording: false,
                    isEncoding: false,
                    isProtected: false,
                    videoFiles: [],
                },
            ];

            await page.route('**/api/recorded*', async route => {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ records: mockRecords, total: 1 }),
                });
            });

            await page.goto('/recorded');
            await page.waitForLoadState('networkidle');

            // 選択モードに切り替え (スマホではアイコンのみ表示、titleで特定)
            const selectModeBtn = page.getByTitle('複数選択モードを開始');
            await expect(selectModeBtn).toBeVisible();
            await selectModeBtn.click();

            // 下部フローティングバーが表示されることを確認
            const floatingBar = page.locator('text=/0\\s*件選択中/');
            await expect(floatingBar).toBeVisible();

            // 選択終了
            const exitModeBtn = page.getByTitle('選択モードを終了').first();
            await expect(exitModeBtn).toBeVisible();
            await exitModeBtn.click();
            await expect(floatingBar).not.toBeVisible();
        });
    });

    // =========================================================================
    // 2. タブレット (Tablet: 768 x 1024)
    // =========================================================================
    test.describe('Tablet Viewport (768 x 1024)', () => {
        test.use({ viewport: { width: 768, height: 1024 } });

        test('should use drawer navigation and render table format on /reserves', async ({ page }) => {
            const consoleErrors: string[] = [];
            const pageErrors: string[] = [];
            page.on('console', msg => {
                if (msg.type() === 'error' && !msg.text().includes('chrome-extension://')) {
                    consoleErrors.push(msg.text());
                }
            });
            page.on('pageerror', err => pageErrors.push(err.message));

            const mockReserves = [
                {
                    id: 902,
                    programId: 1002,
                    channelId: 1,
                    name: 'タブレット用予約番組',
                    description: 'タブレット画面でのテーブル表示テスト',
                    startAt: Date.now() + 3600000,
                    endAt: Date.now() + 7200000,
                    isRecording: false,
                    isConflict: false,
                },
            ];

            await page.route('**/api/reserves*', async route => {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ reserves: mockReserves, total: 1 }),
                });
            });

            await page.goto('/reserves');
            await page.waitForLoadState('networkidle');

            // 1. タブレット幅 (768px < 1024px) では PC サイドバーは非表示
            const pcSidebar = page.locator('aside');
            await expect(pcSidebar).not.toBeVisible();

            // 2. 768px (>= 640px) ではテーブル表示 (table) がレンダリングされる
            const table = page.getByRole('table');
            await expect(table).toBeVisible();
            await expect(table.getByText('タブレット用予約番組')).toBeVisible();

            // 3. ドロワーメニューから番組検索へ移動
            const menuBtn = page.getByRole('button', { name: 'メニューを開閉' });
            await menuBtn.click();
            const drawer = page.getByRole('dialog');
            await expect(drawer).toBeVisible();

            const searchNavLink = drawer.getByRole('button', { name: '番組検索' });
            await expect(searchNavLink).toBeVisible();
            await searchNavLink.click();

            await page.waitForURL(/\/search/);
            await expect(page.locator('h1')).toContainText('番組検索');

            expect(pageErrors).toEqual([]);
            expect(consoleErrors).toEqual([]);
        });

        test('should display multi-column grid on /onair in tablet viewport', async ({ page }) => {
            await page.goto('/onair');
            await page.waitForLoadState('networkidle');

            await expect(page.locator('h1')).toContainText('放送中');
            // 放送波タブバーの存在確認
            await expect(page.getByRole('button', { name: 'すべて' })).toBeVisible();
            await expect(page.getByRole('button', { name: /地デジ/ })).toBeVisible();
        });
    });

    // =========================================================================
    // 3. デスクトップ (Desktop: 1280 x 800)
    // =========================================================================
    test.describe('Desktop Viewport (1280 x 800)', () => {
        test.use({ viewport: { width: 1280, height: 800 } });

        test('should display permanent sidebar and toggle collapse state', async ({ page }) => {
            const consoleErrors: string[] = [];
            const pageErrors: string[] = [];
            page.on('console', msg => {
                if (msg.type() === 'error' && !msg.text().includes('chrome-extension://')) {
                    consoleErrors.push(msg.text());
                }
            });
            page.on('pageerror', err => pageErrors.push(err.message));

            await page.goto('/');
            await page.waitForLoadState('networkidle');

            // 1. PC 用 aside サイドバーが常時表示されていることを確認
            const pcSidebar = page.locator('aside');
            await expect(pcSidebar).toBeVisible();
            await expect(pcSidebar.getByRole('button', { name: 'ダッシュボード' })).toBeVisible();

            // 2. ヘッダーのメニューボタンをクリックしてサイドバーを折りたたむ
            const menuBtn = page.getByRole('button', { name: 'メニューを開閉' });
            await menuBtn.click();
            await expect(pcSidebar).not.toBeVisible();

            // 3. 再度クリックして再展開
            await menuBtn.click();
            await expect(pcSidebar).toBeVisible();

            // 4. サイドバーのリンクから「番組表」へ遷移
            const guideNavLink = pcSidebar.getByRole('button', { name: '番組表' });
            await guideNavLink.click();
            await page.waitForURL(/\/guide/);
            await expect(page.getByRole('button', { name: '現在' })).toBeVisible();

            expect(pageErrors).toEqual([]);
            expect(consoleErrors).toEqual([]);
        });
    });
});
