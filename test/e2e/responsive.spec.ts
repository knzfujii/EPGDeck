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

        test('should ensure proper bottom padding (at least 32px) on main container in mobile viewport', async ({
            page,
        }) => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');

            const mainPaddingBottom = await page.evaluate(() => {
                const mainEl = document.querySelector('main');
                if (!mainEl) return 0;
                return parseFloat(window.getComputedStyle(mainEl).paddingBottom);
            });

            // pb-safe-8 により、スマホ表示時にも最低 32px (2rem) の下部余白が確保される
            expect(mainPaddingBottom).toBeGreaterThanOrEqual(32);
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

        test('should render responsive shortened button labels with unified height on /recorded/detail', async ({
            page,
        }) => {
            const mockDetail = {
                id: 802,
                channelId: 1,
                startAt: Date.now() - 3600000,
                endAt: Date.now(),
                name: 'スマホ表示テスト録画番組',
                description: 'モバイル幅での上部ボタン短縮表示テスト',
                isRecording: false,
                isEncoding: false,
                isProtected: false,
                hasDuplicateHistory: true,
                videoFiles: [{ id: 10, name: 'default', filename: 'test.ts', type: 'ts', size: 1024 * 1024 * 50 }],
            };

            await page.route('**/api/recorded/802*', async route => {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(mockDetail),
                });
            });

            await page.goto('/recorded/detail?recordedId=802');
            await page.waitForLoadState('networkidle');

            // 1. 戻るボタンが「戻る」に短縮されていることを確認
            const backBtn = page.getByRole('button', { name: /戻る/ });
            await expect(backBtn).toBeVisible();
            await expect(backBtn.locator('.sm\\:hidden')).toHaveText('戻る');
            await expect(backBtn.locator('.hidden.sm\\:inline')).not.toBeVisible();

            // 2. 重複除外ボタンが「重複判定除外」と表示されていることを確認
            const duplicateBtn = page.getByRole('button', { name: /重複判定除外/ });
            await expect(duplicateBtn).toBeVisible();
            await expect(duplicateBtn).toContainText('重複判定除外');

            // 3. 保護ボタンが「保護」と表示されていることを確認
            const protectBtn = page.getByRole('button', { name: /保護/ });
            await expect(protectBtn).toBeVisible();
            await expect(protectBtn).toContainText('保護');

            // 4. 削除ボタンが表示され、各ボタンの高さ（h-9: 36px）が揃っていることを確認
            const deleteBtn = page.getByRole('button', { name: '削除', exact: true });
            await expect(deleteBtn).toBeVisible();

            const backBox = await backBtn.boundingBox();
            const duplicateBox = await duplicateBtn.boundingBox();
            const protectBox = await protectBtn.boundingBox();
            const deleteBox = await deleteBtn.boundingBox();

            expect(backBox).not.toBeNull();
            expect(duplicateBox).not.toBeNull();
            expect(protectBox).not.toBeNull();
            expect(deleteBox).not.toBeNull();

            // 高さが36px（誤差1px以内）で揃っていることを検証
            expect(Math.round(duplicateBox!.height)).toBe(36);
            expect(Math.round(protectBox!.height)).toBe(36);
            expect(Math.round(deleteBox!.height)).toBe(36);
            expect(Math.round(backBox!.height)).toBe(36);
        });

        test('should fit all filter tabs on /reserves without horizontal overflow on mobile viewports', async ({
            page,
        }) => {
            for (const width of [390, 360]) {
                await page.setViewportSize({ width, height: 844 });
                await page.goto('/reserves');
                await page.waitForLoadState('networkidle');

                // FilterTabs コンテナと各タブボタンの幅・オーバーフロー検証
                const tabsOverflow = await page.evaluate(() => {
                    const tabsContainer = document.querySelector('main div.overflow-x-auto');
                    if (!tabsContainer) return null;
                    return {
                        scrollWidth: tabsContainer.scrollWidth,
                        clientWidth: tabsContainer.clientWidth,
                        hasScroll: tabsContainer.scrollWidth > tabsContainer.clientWidth,
                    };
                });

                expect(tabsOverflow).not.toBeNull();
                expect(tabsOverflow?.hasScroll, `FilterTabs should not horizontally scroll at ${width}px`).toBe(false);

                // 「競合」タブが画面内に完全に収まっているか
                const conflictTab = page.getByRole('button', { name: /競合/ });
                await expect(conflictTab).toBeVisible();
                const conflictBox = await conflictTab.boundingBox();
                expect(conflictBox).not.toBeNull();
                expect(conflictBox!.x + conflictBox!.width).toBeLessThanOrEqual(width);
            }
        });

        test('should not cause page horizontal scroll on core routes at mobile viewport widths', async ({ page }) => {
            const routes = ['/reserves', '/rule/edit', '/recorded', '/guide', '/onair', '/logs'];
            for (const width of [390, 360]) {
                await page.setViewportSize({ width, height: 844 });
                for (const route of routes) {
                    await page.goto(route);
                    await page.waitForLoadState('domcontentloaded');
                    await page.waitForTimeout(300);

                    const overflowInfo = await page.evaluate(() => {
                        const doc = document.documentElement;
                        const main = document.querySelector('main');
                        return {
                            hasDocScroll: doc.scrollWidth > window.innerWidth,
                            hasMainScroll: main ? main.scrollWidth > main.clientWidth : false,
                        };
                    });

                    expect(overflowInfo.hasDocScroll, `Doc horizontal scroll on ${route} at ${width}px`).toBe(false);
                    expect(overflowInfo.hasMainScroll, `Main horizontal scroll on ${route} at ${width}px`).toBe(false);
                }
            }
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
