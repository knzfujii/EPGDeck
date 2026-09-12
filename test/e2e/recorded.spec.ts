import { test, expect } from '@playwright/test';

test.describe('Recorded List Page (/recorded)', () => {
    test('should display recorded items, filter controls, view toggles, and navigate to details', async ({ page }) => {
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

        await page.goto('/recorded');
        await page.waitForLoadState('networkidle');

        // 1. ヘッダーとタイトル
        await expect(page.locator('h1')).toContainText('録画一覧');

        // 2. 検索バーとフィルタ
        const searchInput = page.getByPlaceholder('録画を検索...');
        await expect(searchInput).toBeVisible();
        await searchInput.fill('NHK');
        await expect(searchInput).toHaveValue('NHK');
        await searchInput.clear();

        // 3. 表示切り替え (カード / テーブル)
        const viewModeButtons = page.locator('button[title*="表示"]');
        const viewBtnCount = await viewModeButtons.count();
        if (viewBtnCount > 0) {
            await viewModeButtons.first().click();
        }

        // 4. 録画カードから詳細ページへの遷移検証
        const detailLink = page.locator('a[href*="/recorded/detail"]').first();
        const hasRecordedItem = await detailLink.isVisible().catch(() => false);

        if (hasRecordedItem) {
            await detailLink.click();
            await page.waitForURL(/\/recorded\/detail/);

            // 詳細ページの要素確認
            await expect(page.locator('h1')).toBeVisible();
            await expect(page.getByRole('button', { name: /再生する/ })).toBeVisible();
            await expect(page.getByRole('button', { name: /エンコード追加/ })).toBeVisible();
        }

        // 5. エラーゼロの検証
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should support multiple selection mode and bulk operations (toggle, select all, deselect, delete modal)', async ({
        page,
    }) => {
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

        // モック録画データを用意
        const mockRecords = [
            {
                id: 101,
                channelId: 1,
                startAt: Date.now() - 3600000 * 3,
                endAt: Date.now() - 3600000 * 2,
                name: 'テスト番組1 (未保護)',
                description: 'テスト番組1の詳細',
                isRecording: false,
                isEncoding: false,
                isProtected: false,
                videoFiles: [{ id: 1, name: 'default', filename: 'test1.ts', type: 'ts', size: 1024 * 1024 * 100 }],
            },
            {
                id: 102,
                channelId: 1,
                startAt: Date.now() - 3600000 * 2,
                endAt: Date.now() - 3600000 * 1,
                name: 'テスト番組2 (保護中)',
                description: 'テスト番組2の詳細',
                isRecording: false,
                isEncoding: false,
                isProtected: true,
                videoFiles: [{ id: 2, name: 'default', filename: 'test2.ts', type: 'ts', size: 1024 * 1024 * 200 }],
            },
            {
                id: 103,
                channelId: 2,
                startAt: Date.now() - 3600000 * 1,
                endAt: Date.now(),
                name: 'テスト番組3 (未保護)',
                description: 'テスト番組3の詳細',
                isRecording: false,
                isEncoding: false,
                isProtected: false,
                videoFiles: [{ id: 3, name: 'default', filename: 'test3.ts', type: 'ts', size: 1024 * 1024 * 300 }],
            },
        ];

        await page.route('**/api/recorded*', async route => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        records: mockRecords,
                        total: mockRecords.length,
                    }),
                });
            } else {
                await route.continue();
            }
        });

        await page.goto('/recorded');
        await page.waitForLoadState('networkidle');

        // 番組が表示されていることを確認
        await expect(page.getByText('テスト番組1 (未保護)')).toBeVisible();
        await expect(page.getByText('テスト番組2 (保護中)')).toBeVisible();
        await expect(page.getByText('テスト番組3 (未保護)')).toBeVisible();

        // 1. 選択モードのトグル確認
        const selectModeBtn = page.getByRole('button', { name: /^選択$/ });
        await expect(selectModeBtn).toBeVisible();

        // フローティングバーは最初は非表示
        await expect(page.locator('text=/\\d+\\s*件選択中/')).not.toBeVisible();

        // 選択モードに切り替え
        await selectModeBtn.click();
        await expect(page.getByRole('button', { name: '選択終了' })).toBeVisible();
        await expect(page.locator('text=/0\\s*件選択中/')).toBeVisible();

        // 2. 保護番組のチェックボックスが無効化されていることを確認
        const protectedCheckbox = page.getByRole('checkbox', { name: 'テスト番組2 (保護中)を選択' });
        await expect(protectedCheckbox).toBeDisabled();

        // 3. 未保護番組を1件選択
        const item1Checkbox = page.getByRole('checkbox', { name: 'テスト番組1 (未保護)を選択' });
        await expect(item1Checkbox).not.toBeChecked();
        await item1Checkbox.click();
        await expect(item1Checkbox).toBeChecked();

        // フローティングバーが表示され、「1 件選択中」になっていることを確認
        await expect(page.locator('text=/1\\s*件選択中/')).toBeVisible();

        // 4. すべて選択ボタンをクリック（未保護番組のみが選択されることを確認）
        const selectAllBtn = page.getByRole('button', { name: 'すべて選択' });
        await expect(selectAllBtn).toBeVisible();
        await selectAllBtn.click();

        // 保護番組を除外した2件が選択される
        await expect(page.locator('text=/2\\s*件選択中/')).toBeVisible();
        const item3Checkbox = page.getByRole('checkbox', { name: 'テスト番組3 (未保護)を選択' });
        await expect(item3Checkbox).toBeChecked();
        await expect(protectedCheckbox).not.toBeChecked();

        // 5. テーブル表示に切り替えても選択状態が維持され、テーブルでも操作できることを確認
        const tableViewBtn = page.getByRole('button', { name: 'テーブル表示' });
        if (await tableViewBtn.isVisible()) {
            await tableViewBtn.click();
            await expect(page.locator('text=/2\\s*件選択中/')).toBeVisible();
        }

        // 6. 削除ボタンをクリックして確認モーダルを表示
        const bulkDeleteBtn = page.getByRole('button', { name: /一括削除/ });
        await expect(bulkDeleteBtn).toBeVisible();
        await bulkDeleteBtn.click();

        // 確認モーダルの表示確認
        await expect(page.getByRole('heading', { name: '録画番組の一括削除' })).toBeVisible();
        await expect(page.getByText('選択した 2 件の録画番組')).toBeVisible();

        // キャンセルをクリック
        const cancelBtn = page.getByRole('button', { name: 'キャンセル' }).last();
        await cancelBtn.click();
        await expect(page.getByRole('heading', { name: '録画番組の一括削除' })).not.toBeVisible();

        // 選択状態が維持されていることを確認
        await expect(page.locator('text=/2\\s*件選択中/')).toBeVisible();

        // 7. 解除をクリック
        const deselectAllBtn = page.getByRole('button', { name: '解除', exact: true });
        await deselectAllBtn.click();

        // 0 件選択中になることを確認
        await expect(page.locator('text=/0\\s*件選択中/')).toBeVisible();

        // 8. 選択終了をクリックして選択モードを抜ける
        const exitSelectionBtn = page.getByRole('button', { name: '選択終了' });
        await exitSelectionBtn.click();
        await expect(page.getByRole('button', { name: /^選択$/ })).toBeVisible();
        await expect(page.locator('text=/\\d+\\s*件選択中/')).not.toBeVisible();

        // エラーゼロの検証
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should execute bulk deletion of selected items via API and display success snackbar', async ({ page }) => {
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

        let records = [
            {
                id: 201,
                channelId: 1,
                startAt: Date.now() - 3600000 * 2,
                endAt: Date.now() - 3600000 * 1,
                name: '一括削除対象番組1',
                description: '説明1',
                isRecording: false,
                isEncoding: false,
                isProtected: false,
                videoFiles: [{ id: 1, name: 'default', filename: 'del1.ts', type: 'ts', size: 1024 * 1024 }],
            },
            {
                id: 202,
                channelId: 1,
                startAt: Date.now() - 3600000 * 1,
                endAt: Date.now(),
                name: '一括削除対象番組2',
                description: '説明2',
                isRecording: false,
                isEncoding: false,
                isProtected: false,
                videoFiles: [{ id: 2, name: 'default', filename: 'del2.ts', type: 'ts', size: 1024 * 1024 }],
            },
        ];

        const deletedIds: number[] = [];

        await page.route('**/api/recorded/**', async route => {
            const req = route.request();
            if (req.method() === 'DELETE') {
                const url = req.url();
                const match = url.match(/\/api\/recorded\/(\d+)/);
                if (match) {
                    const id = parseInt(match[1], 10);
                    deletedIds.push(id);
                    records = records.filter(r => r.id !== id);
                }
                await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
                return;
            }
            await route.continue();
        });

        await page.route('**/api/recorded?*', async route => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        records,
                        total: records.length,
                    }),
                });
                return;
            }
            await route.continue();
        });

        await page.goto('/recorded');
        await page.waitForLoadState('networkidle');

        await expect(page.getByText('一括削除対象番組1')).toBeVisible();
        await expect(page.getByText('一括削除対象番組2')).toBeVisible();

        // 選択モードに切り替え
        await page.getByRole('button', { name: /^選択$/ }).click();

        // すべて選択
        await page.getByRole('button', { name: 'すべて選択' }).click();
        await expect(page.locator('text=/2\\s*件選択中/')).toBeVisible();

        // 一括削除ボタンをクリック
        await page.getByRole('button', { name: '一括削除', exact: true }).click();

        // 確認モーダルで「2件を削除」をクリック
        const confirmDeleteBtn = page.getByRole('button', { name: '2件を削除' });
        await expect(confirmDeleteBtn).toBeVisible();
        await confirmDeleteBtn.click();

        // スナックバーで成功メッセージを確認
        await expect(page.getByText('2 件の録画を削除しました')).toBeVisible();

        // API が双方の ID で呼ばれたことを確認
        expect(deletedIds).toEqual([201, 202]);

        // 削除後に選択モードが自動終了していることを確認
        await expect(page.getByRole('button', { name: /^選択$/ })).toBeVisible();
        await expect(page.locator('text=/\\d+\\s*件選択中/')).not.toBeVisible();

        // エラーゼロの検証
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should filter recorded items by rule and date (year/month), and allow clearing filters', async ({ page }) => {
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

        // モックルールと録画データ
        await page.route('**/api/rules?*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    rules: [
                        { id: 10, searchOption: { keyword: 'アニメ録画ルール' } },
                        { id: 20, searchOption: { keyword: 'ドラマ録画ルール' } },
                    ],
                    total: 2,
                }),
            });
        });

        await page.route('**/api/recorded*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    records: [
                        {
                            id: 301,
                            channelId: 1,
                            startAt: Date.now() - 3600000,
                            endAt: Date.now(),
                            name: 'ルール対象アニメ番組',
                            description: 'アニメ詳細',
                            isRecording: false,
                            isEncoding: false,
                            isProtected: false,
                            videoFiles: [],
                        },
                    ],
                    total: 1,
                }),
            });
        });

        await page.goto('/recorded');
        await page.waitForLoadState('networkidle');

        // 1. ルール選択セレクトボックスの存在確認と選択
        const ruleSelect = page.locator('select').first();
        await expect(ruleSelect).toBeVisible();

        // ルール10を選択
        await ruleSelect.selectOption('10');
        await page.waitForURL(/ruleId=10/);

        // ルール絞り込み解除ボタン (X) が表示されることを確認
        const clearRuleBtn = page.getByTitle('ルール絞り込みを解除').first();
        await expect(clearRuleBtn).toBeVisible();

        // 解除ボタンをクリックしてリセット
        await clearRuleBtn.click();
        await expect(clearRuleBtn).not.toBeVisible();

        // 2. 年月選択セレクトボックスの操作
        const yearSelect = page.locator('select').filter({ hasText: /年/ });
        if (await yearSelect.isVisible()) {
            const currentYear = new Date().getFullYear();
            await yearSelect.selectOption(String(currentYear));

            const clearDateBtn = page.getByTitle('年月指定を解除').first();
            await expect(clearDateBtn).toBeVisible();
            await clearDateBtn.click();
            await expect(clearDateBtn).not.toBeVisible();
        }

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should display drop logs and quality metrics on recorded detail page', async ({ page }) => {
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

        // モック録画詳細データ（ドロップログ付き）
        const mockDetail = {
            id: 501,
            channelId: 1,
            startAt: Date.now() - 3600000,
            endAt: Date.now(),
            name: '品質検証対象番組 (ドロップあり)',
            description: '番組詳細情報',
            extended: { 詳細情報: 'テキスト' },
            isRecording: false,
            isEncoding: false,
            isProtected: false,
            videoFiles: [{ id: 1, name: 'TS', filename: 'drop_test.ts', type: 'ts', size: 1024 * 1024 * 50 }],
            dropLogFile: {
                id: 99,
                dropCnt: 12,
                errorCnt: 3,
                scramblingCnt: 0,
            },
        };

        await page.route('**/api/recorded/501*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockDetail),
            });
        });

        await page.route('**/api/dropLogs/99', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'text/plain',
                body: 'pid: 0x0100, drop: 12, error: 3',
            });
        });

        await page.goto('/recorded/detail?recordedId=501');
        await page.waitForLoadState('networkidle');

        // 番組タイトルが表示されることを確認
        await expect(page.locator('h1')).toContainText('品質検証対象番組 (ドロップあり)');

        // ドロップログボタンをクリックしてモーダルを開く
        const dropLogBtn = page.getByRole('button', { name: 'ドロップログ' });
        await expect(dropLogBtn).toBeVisible();
        await dropLogBtn.click();

        // ドロップ情報モーダルの各メトリクスが表示されることを確認
        const dropModal = page.getByRole('dialog');
        await expect(dropModal).toBeVisible();
        await expect(dropModal.getByText('ドロップ', { exact: true })).toBeVisible();
        await expect(dropModal.getByText('12', { exact: true })).toBeVisible();
        await expect(dropModal.getByText('エラー', { exact: true })).toBeVisible();
        await expect(dropModal.getByText('3', { exact: true })).toBeVisible();
        await expect(dropModal.locator('pre')).toContainText('pid: 0x0100, drop: 12, error: 3');

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});
