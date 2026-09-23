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

    test('should control external player button visibility based on mobile/PC and display it next to play on mobile', async ({
        browser,
    }) => {
        // モック録画詳細データ
        const mockDetail = {
            id: 502,
            channelId: 1,
            startAt: Date.now() - 3600000,
            endAt: Date.now(),
            name: '外部プレイヤー連携検証番組',
            description: '番組詳細情報',
            extended: { 詳細情報: 'テキスト' },
            isRecording: false,
            isEncoding: false,
            isProtected: false,
            videoFiles: [{ id: 10, name: 'TS', filename: 'external_test.ts', type: 'ts', size: 1024 * 1024 * 100 }],
        };

        // 1. PC環境（デスクトップ）では外部再生ボタンが非表示であることを確認
        const pcContext = await browser.newContext();
        const pcPage = await pcContext.newPage();
        await pcPage.route('**/api/recorded/502*', async route => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDetail) });
        });
        await pcPage.goto('/recorded/detail?recordedId=502');
        await pcPage.waitForLoadState('networkidle');
        await expect(pcPage.getByRole('button', { name: /外部再生/ })).toHaveCount(0);
        await pcContext.close();

        // 2. モバイル環境（iPhone）では再生ボタンの次に外部再生ボタンが表示され、クリックできることを確認
        const mobileContext = await browser.newContext({
            userAgent:
                'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            viewport: { width: 390, height: 844 },
        });
        await mobileContext.grantPermissions(['clipboard-read', 'clipboard-write']);
        const mobilePage = await mobileContext.newPage();
        await mobilePage.route('**/api/recorded/502*', async route => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDetail) });
        });
        await mobilePage.goto('/recorded/detail?recordedId=502');
        await mobilePage.waitForLoadState('networkidle');

        const playBtn = mobilePage.getByRole('button', { name: /再生/ }).first();
        const externalPlayBtn = mobilePage.getByRole('button', { name: /外部再生/ }).first();

        await expect(playBtn).toBeVisible();
        await expect(externalPlayBtn).toBeVisible();
        await externalPlayBtn.click();

        await mobileContext.close();
    });

    test('should allow excluding from and re-adding to duplicate check on RecordedDetail', async ({ page }) => {
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

        const mockDetail = {
            id: 601,
            channelId: 1,
            startAt: Date.now() - 3600000,
            endAt: Date.now(),
            name: '災害特番差し替え番組',
            description: '番組詳細',
            isRecording: false,
            isEncoding: false,
            isProtected: false,
            hasDuplicateHistory: true,
            videoFiles: [{ id: 20, name: 'TS', filename: 'test.ts', type: 'ts', size: 1024 * 1024 * 10 }],
        };

        let historyDeleteCalled = false;
        let historyPostCalled = false;

        await page.route('**/api/recorded/601/history', async route => {
            if (route.request().method() === 'DELETE') {
                historyDeleteCalled = true;
                mockDetail.hasDuplicateHistory = false;
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ code: 200 }),
                });
            } else if (route.request().method() === 'POST') {
                historyPostCalled = true;
                mockDetail.hasDuplicateHistory = true;
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ code: 200 }),
                });
            } else {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ hasHistory: mockDetail.hasDuplicateHistory }),
                });
            }
        });

        await page.route('**/api/recorded/601*', async route => {
            if (route.request().url().includes('/history')) return;
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDetail) });
        });

        await page.goto('/recorded/detail?recordedId=601');
        await page.waitForLoadState('networkidle');

        // 初期表示: 重複判定履歴が存在するため「重複判定から除外」ボタンと「重複判定対象」バッジが表示される
        const excludeBtn = page.getByRole('button', { name: /重複判定から除外/ });
        await expect(excludeBtn).toBeVisible();
        await expect(page.getByText('重複判定対象')).toBeVisible();

        // 「重複判定から除外」をクリック -> 確認ダイアログが表示される
        await excludeBtn.click();
        await expect(page.getByRole('heading', { name: '重複判定からの除外' })).toBeVisible();
        await expect(page.getByText('二重録画防止（重複判定）の対象から除外しますか？')).toBeVisible();

        // ダイアログ内の「除外する」をクリック
        const confirmBtn = page.getByRole('button', { name: '除外する' });
        await confirmBtn.click();

        // DELETE API が呼ばれ、トーストが表示され、ボタンが「重複判定に追加」に切り替わり、バッジは非表示になる
        await expect(page.getByText('重複判定から除外しました')).toBeVisible();
        expect(historyDeleteCalled).toBe(true);

        const addBtn = page.getByRole('button', { name: /重複判定に追加/ });
        await expect(addBtn).toBeVisible();
        await expect(page.getByText('重複判定対象')).toHaveCount(0);

        // 「重複判定に追加」をクリック
        await addBtn.click();

        // POST API が呼ばれ、トーストが表示され、ボタンが元に戻り、バッジが再表示される
        await expect(page.getByText('重複判定の対象に追加しました')).toBeVisible();
        expect(historyPostCalled).toBe(true);
        await expect(page.getByRole('button', { name: /重複判定から除外/ })).toBeVisible();
        await expect(page.getByText('重複判定対象')).toBeVisible();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should open thumbnail recreation modal, specify time, and request recreation', async ({ page }) => {
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

        const mockDetail = {
            id: 701,
            name: 'サムネイル再作成テスト番組',
            description: 'サムネイル再作成の動作確認用番組',
            startAt: 1710000000000,
            endAt: 1710003600000,
            duration: 3600,
            isRecording: false,
            thumbnails: [888],
            videoFiles: [
                {
                    id: 901,
                    name: 'test_video.mp4',
                    filename: 'test_video.mp4',
                    type: 'encoded',
                    size: 104857600,
                },
            ],
            channel: {
                id: 1,
                name: 'テスト局',
                channelType: 'GR',
            },
        };

        let thumbnailPostCalled = false;
        let requestedSeconds = '';
        let requestedReplace = '';

        await page.route('**/api/recorded/701*', async route => {
            if (route.request().url().includes('/history')) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ hasHistory: false }),
                });
                return;
            }
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDetail) });
        });

        await page.route('**/api/thumbnails/888*', async route => {
            await route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from('') });
        });

        await page.route('**/api/thumbnails/videos/901*', async route => {
            if (route.request().method() === 'POST') {
                thumbnailPostCalled = true;
                const url = new URL(route.request().url());
                requestedSeconds = url.searchParams.get('seconds') || '';
                requestedReplace = url.searchParams.get('replace') || '';
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: 888 }),
                });
                return;
            }
            await route.continue();
        });

        await page.goto('/recorded/detail?recordedId=701');
        await page.waitForLoadState('networkidle');

        // サムネイル上のカメラボタン「サムネイルを再作成」をクリック
        const cameraBtn = page.getByRole('button', { name: 'サムネイルを再作成' });
        await expect(cameraBtn).toBeVisible({ timeout: 5000 });
        await cameraBtn.click();

        // モーダルが表示されること
        const modal = page.getByRole('dialog');
        await expect(modal).toBeVisible();
        await expect(modal.getByText('サムネイル再作成')).toBeVisible();

        // 時間入力欄に「00:01:30」を入力（90秒）
        const timeInput = modal.locator('input[type="text"]');
        await timeInput.fill('00:01:30');

        // 「再作成を実行」ボタンをクリック
        const submitBtn = modal.getByRole('button', { name: /再作成を実行/ });
        await expect(submitBtn).toBeEnabled();
        await submitBtn.click();

        // API リクエストが送信され、パラメータが正しいこと
        expect(thumbnailPostCalled).toBe(true);
        expect(requestedSeconds).toBe('90');
        expect(requestedReplace).toBe('true');

        // 成功通知が表示され、モーダルが閉じること
        await expect(page.getByText('サムネイルの再作成をリクエストしました')).toBeVisible();
        await expect(modal).not.toBeVisible();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should allow toggling protect status and deleting single recorded item on RecordedDetail', async ({
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

        const mockRecorded = {
            id: 9901,
            ruleId: null,
            channelId: 1,
            startAt: Date.now() - 3600000,
            endAt: Date.now() - 1800000,
            duration: 1800,
            name: 'テスト特番「保護と削除の検証」',
            description: '番組保護トグルおよび個別削除のE2Eテスト用番組',
            extended: '出演: テスト太郎',
            genre1: 0,
            isProtected: false,
            hasDuplicateHistory: true,
            thumbnails: [],
            videoFiles: [
                {
                    id: 9001,
                    name: 'TS',
                    filename: 'test_protect_delete.ts',
                    type: 'ts',
                    size: 1024 * 1024 * 500,
                },
            ],
        };

        let protectCalled = false;
        let unprotectCalled = false;
        let deleteCalled = false;

        await page.route(/\/api\/recorded/, async route => {
            const url = route.request().url();
            const method = route.request().method();

            if (url.includes('/9901/protect') && method === 'PUT') {
                protectCalled = true;
                mockRecorded.isProtected = true;
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
                return;
            }

            if (url.includes('/9901/unprotect') && method === 'PUT') {
                unprotectCalled = true;
                mockRecorded.isProtected = false;
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
                return;
            }

            if (url.includes('/9901') && method === 'DELETE') {
                deleteCalled = true;
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
                return;
            }

            if (url.includes('/9901') && method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(mockRecorded),
                });
                return;
            }

            if (method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ records: [mockRecorded], total: 1 }),
                });
                return;
            }

            await route.continue();
        });

        await page.goto('/recorded/detail?recordedId=9901');
        await page.waitForLoadState('networkidle');

        // 1. 初期状態: 未保護、タイトル表示確認
        await expect(page.locator('h1')).toContainText('テスト特番「保護と削除の検証」');
        const protectBtn = page.getByRole('button', { name: '保護する' });
        await expect(protectBtn).toBeVisible();

        // 削除ボタンが表示されていること
        const deleteBtn = page.locator('button[title="録画を削除"]');
        await expect(deleteBtn).toBeVisible();

        // 2. 保護ボタンをクリック -> 保護状態へ
        await protectBtn.click();
        await expect.poll(() => protectCalled).toBe(true);
        await expect(page.getByText('番組を保護しました')).toBeVisible();

        // ボタンが「保護中」に変わり、保護中は削除ボタンが非表示になること
        const unprotectBtn = page.getByRole('button', { name: '保護中' });
        await expect(unprotectBtn).toBeVisible();
        await expect(deleteBtn).not.toBeVisible();

        // 3. 「保護中」をクリック -> 保護解除へ
        await unprotectBtn.click();
        await expect.poll(() => unprotectCalled).toBe(true);
        await expect(page.getByText('保護を解除しました')).toBeVisible();

        // 再び「保護する」と「削除」ボタンが表示されること
        await expect(protectBtn).toBeVisible();
        await expect(deleteBtn).toBeVisible();

        // 4. 「削除」ボタンをクリック -> 確認モーダル -> 削除実行
        await deleteBtn.click();
        const confirmModal = page.getByRole('dialog');
        await expect(confirmModal.getByRole('heading', { name: '録画番組の削除' })).toBeVisible();
        await expect(confirmModal.getByText(/テスト特番「保護と削除の検証」.*を削除しますか/)).toBeVisible();

        const confirmDeleteBtn = confirmModal.getByRole('button', { name: '削除' });
        await confirmDeleteBtn.click();

        // 削除 API 呼び出し、トースト、および /recorded への自動遷移確認
        await expect.poll(() => deleteCalled).toBe(true);
        await expect(page.getByText('録画を削除しました')).toBeVisible();
        await page.waitForURL(/\/recorded$/);

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});
