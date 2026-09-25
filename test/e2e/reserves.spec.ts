import { test, expect } from '@playwright/test';

test.describe('Reserves and Manual Reserve Pages', () => {
    test('should display reserves list, filter tabs, and navigate to manual reserve page', async ({ page }) => {
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

        // 1. 予約一覧ページ
        await page.goto('/reserves');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1')).toContainText('予約一覧');

        // 2. フィルタタブ（すべて、重複、競合など）
        await expect(page.getByRole('button', { name: /すべて/ })).toBeVisible();

        // 3. 手動予約追加ボタンをクリックして手動予約ページへ遷移
        const manualReserveBtn = page.getByRole('button', { name: /手動予約/ });
        await expect(manualReserveBtn).toBeVisible();
        await manualReserveBtn.click();
        await page.waitForURL(/\/reserves\/manual/);

        // 4. 手動予約フォームの各要素確認
        await expect(page.locator('h1')).toContainText('時間指定手動予約');
        const nameInput = page.getByPlaceholder(/深夜アニメ/);
        await expect(nameInput).toBeVisible();
        await nameInput.fill('テスト予約');
        await expect(nameInput).toHaveValue('テスト予約');

        // 5. エラーゼロの検証
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should display currently recording status, progress bar, watch button, and filter by recording tab', async ({
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

        const now = Date.now();
        const mockReserves = [
            {
                id: 1001,
                channelId: 1,
                programId: 10001,
                startAt: now - 30 * 60 * 1000, // 30分前開始
                endAt: now + 30 * 60 * 1000, // 30分後終了 (50% 進行)
                name: '現在録画中アニメ番組',
                description: '録画進行中の番組概要テキスト',
                isSkip: false,
                isConflict: false,
                isOverlap: false,
                allowEndLack: false,
                isTimeSpecified: false,
            },
            {
                id: 1002,
                channelId: 1,
                programId: 10002,
                startAt: now + 60 * 60 * 1000, // 1時間後開始
                endAt: now + 120 * 60 * 1000,
                name: '未来の通常予約番組',
                description: '待機中の予約概要テキスト',
                isSkip: false,
                isConflict: false,
                isOverlap: false,
                allowEndLack: false,
                isTimeSpecified: false,
            },
        ];

        const mockRecording = [
            {
                id: 1001,
                channelId: 1,
                programId: 10001,
                startAt: now - 30 * 60 * 1000,
                endAt: now + 30 * 60 * 1000,
                name: '現在録画中アニメ番組',
            },
        ];

        await page.route('**/api/reserves?*', async route => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        reserves: mockReserves,
                        total: mockReserves.length,
                    }),
                });
                return;
            }
            await route.continue();
        });

        await page.route('**/api/recording*', async route => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        records: mockRecording,
                        total: mockRecording.length,
                    }),
                });
                return;
            }
            await route.continue();
        });

        await page.goto('/reserves');
        await page.waitForLoadState('networkidle');

        // 1. フィルタータブに「録画中」タブが存在しないことを確認（せいぜい8件のため絞り込み不要）
        const recordingTab = page.getByRole('button', { name: /録画中\s*\(/ });
        await expect(recordingTab).not.toBeVisible();

        // 2. テーブル行に「現在録画中アニメ番組」と「未来の通常予約番組」が表示されていることを確認
        const table = page.getByRole('table');
        await expect(table.getByText('現在録画中アニメ番組')).toBeVisible();
        await expect(table.getByText('未来の通常予約番組')).toBeVisible();

        // 3. 録画中行のバッジ（● 録画中）と進行度（50%）および視聴ボタンを確認
        await expect(table.getByText('● 録画中')).toBeVisible();
        await expect(table.getByText(/50%/)).toBeVisible();
        const watchBtn = table.getByRole('button', { name: /視聴/ });
        await expect(watchBtn).toBeVisible();

        // 5. 録画中行をクリックして詳細モーダルを開く
        await table.getByText('現在録画中アニメ番組').click();
        await expect(page.getByRole('dialog')).toBeVisible();

        // モーダル内の録画中バッジ、進行中テキスト、ライブ視聴ボタンを確認
        const modal = page.getByRole('dialog');
        await expect(modal.getByText('● 録画中')).toBeVisible();
        await expect(modal.getByText(/50% 進行中/)).toBeVisible();
        await expect(modal.getByRole('button', { name: 'ライブ視聴' })).toBeVisible();

        // モーダル内の「停止」ボタンをクリックすると 3択モーダルが表示されることを確認
        let finishCalled = false;
        await page.route('**/api/recording/*/finish', async route => {
            finishCalled = true;
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200 }) });
        });

        await modal.getByRole('button', { name: '停止' }).click();

        // 3択モーダル（録画中番組の操作）の表示検証
        const actionModal = page.getByRole('dialog').filter({ hasText: '録画中番組の操作' });
        await expect(actionModal).toBeVisible();
        await expect(actionModal.getByRole('button', { name: /完了として保存/ })).toBeVisible();
        await expect(actionModal.getByRole('button', { name: /中断して保存/ })).toBeVisible();
        await expect(actionModal.getByRole('button', { name: /録画を取り消し（ファイルを破棄）/ })).toBeVisible();

        // 閉じるボタンで一度モーダルを閉じる
        await actionModal.getByRole('button', { name: /何もしない（閉じる）/ }).click();
        await expect(actionModal).not.toBeVisible();

        // 再度「停止」を開いて「中断して保存」をテスト
        let stopCalled = false;
        await page.route('**/api/recording/*/stop', async route => {
            stopCalled = true;
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200 }) });
        });
        await modal.getByRole('button', { name: '停止' }).click();
        await expect(actionModal).toBeVisible();
        await actionModal.getByRole('button', { name: /中断して保存/ }).click();
        await expect(actionModal).not.toBeVisible();
        expect(stopCalled).toBe(true);

        // 詳細モーダルを再展開して「取り消し（破棄）」をテスト
        let discardCalled = false;
        await page.route('**/api/recording/*/discard', async route => {
            discardCalled = true;
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200 }) });
        });
        await table.getByText('現在録画中アニメ番組').click();
        await modal.getByRole('button', { name: '停止' }).click();
        await expect(actionModal).toBeVisible();
        await actionModal.getByRole('button', { name: /録画を取り消し（ファイルを破棄）/ }).click();
        await expect(actionModal).not.toBeVisible();
        expect(discardCalled).toBe(true);

        // 再度展開して「完了として保存」をテスト
        await table.getByText('現在録画中アニメ番組').click();
        await modal.getByRole('button', { name: '停止' }).click();
        await expect(actionModal).toBeVisible();
        await actionModal.getByRole('button', { name: /完了として保存/ }).click();
        await expect(actionModal).not.toBeVisible();
        expect(finishCalled).toBe(true);

        // エラーゼロの検証
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should submit manual reservation with full recording options successfully', async ({ page }) => {
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

        // 1. 手動予約ページへアクセス
        await page.goto('/reserves/manual');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1')).toContainText('時間指定手動予約');

        // 2. フォーム入力
        const nameInput = page.getByPlaceholder(/深夜アニメ/);
        await nameInput.fill('E2E手動テスト特別番組');

        const descInput = page.getByPlaceholder(/番組の詳細やメモ/);
        await descInput.fill('手動予約のテスト概要です');

        // 3. 録画オプション (TS保存先・末尾欠け許可・エンコード設定)
        const subDirInput = page.getByPlaceholder(/サブディレクトリ \(任意\)/).first();
        await subDirInput.fill('manual_test_dir');

        const allowEndLackCheckbox = page.getByLabel('チューナー競合時の末尾切れを許可');
        await allowEndLackCheckbox.check();
        await expect(allowEndLackCheckbox).toBeChecked();

        const deleteOriginalCheckbox = page.getByLabel('エンコード完了後に元TSファイルを自動削除');
        await deleteOriginalCheckbox.check();
        await expect(deleteOriginalCheckbox).toBeChecked();

        // 4. 送信リクエストのインターセプト・検証
        let submittedPayload: any = null;
        await page.route('**/api/reserves', async route => {
            if (route.request().method() === 'POST') {
                submittedPayload = route.request().postDataJSON();
                await route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify({ reserveId: 8888 }),
                });
            } else {
                await route.continue();
            }
        });

        // 5. 予約追加ボタンをクリック
        const submitBtn = page.getByRole('button', { name: /予約を追加/ });
        await expect(submitBtn).toBeEnabled();
        await submitBtn.click();

        // 6. 送信ペイロードの構造チェック
        await expect(async () => {
            expect(submittedPayload).not.toBeNull();
        }).toPass();

        expect(submittedPayload.allowEndLack).toBe(true);
        expect(submittedPayload.timeSpecifiedOption).toBeDefined();
        expect(submittedPayload.timeSpecifiedOption.name).toBe('E2E手動テスト特別番組');
        expect(typeof submittedPayload.timeSpecifiedOption.channelId).toBe('number');
        expect(typeof submittedPayload.timeSpecifiedOption.startAt).toBe('number');
        expect(typeof submittedPayload.timeSpecifiedOption.endAt).toBe('number');
        expect(submittedPayload.timeSpecifiedOption.startAt).toBeLessThan(submittedPayload.timeSpecifiedOption.endAt);
        expect(submittedPayload.saveOption).toEqual({
            parentDirectoryName: undefined,
            directory: 'manual_test_dir',
        });
        expect(submittedPayload.encodeOption).toBeDefined();
        expect(submittedPayload.encodeOption.isDeleteOriginalAfterEncode).toBe(true);

        // 7. 送信成功後に予約一覧へ遷移
        await page.waitForURL(/\/reserves$/);

        // エラーゼロの検証
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should filter reserves by tabs (conflicts, skips, overlaps), skip a rule reserve, and restore a skipped reserve', async ({
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

        const futureTime = Date.now() + 3600000;
        const mockReserves = [
            {
                id: 101,
                programId: 201,
                channelId: 1,
                name: '通常ルール予約アニメ',
                description: '通常予定のルール予約',
                startAt: futureTime,
                endAt: futureTime + 1800000,
                isHalfWidth: true,
                isSkip: false,
                isConflict: false,
                isOverlap: false,
                ruleId: 10,
                allowEndLack: true,
            },
            {
                id: 102,
                programId: 202,
                channelId: 1,
                name: '競合発生ドラマ',
                description: 'チューナー不足で競合しているドラマ',
                startAt: futureTime + 3600000,
                endAt: futureTime + 5400000,
                isHalfWidth: true,
                isSkip: false,
                isConflict: true,
                isOverlap: false,
                allowEndLack: true,
            },
            {
                id: 103,
                programId: 203,
                channelId: 1,
                name: 'スキップ済みバラエティ',
                description: '以前に除外された番組',
                startAt: futureTime + 7200000,
                endAt: futureTime + 9000000,
                isHalfWidth: true,
                isSkip: true,
                isConflict: false,
                isOverlap: false,
                ruleId: 10,
                allowEndLack: true,
            },
            {
                id: 104,
                programId: 204,
                channelId: 1,
                name: '重複スキップ映画',
                description: '二重録画防止でスキップされた映画',
                startAt: futureTime + 10800000,
                endAt: futureTime + 12600000,
                isHalfWidth: true,
                isSkip: false,
                isConflict: false,
                isOverlap: true,
                ruleId: 10,
                allowEndLack: true,
            },
        ];

        let deleteSkipCalled = false;
        let deleteReserveCalled = false;

        await page.route(/\/api\/reserves/, async route => {
            const url = route.request().url();
            const method = route.request().method();
            if (url.includes('/103/skip') && method === 'DELETE') {
                deleteSkipCalled = true;
                const target = mockReserves.find(r => r.id === 103);
                if (target) target.isSkip = false;
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
                return;
            }
            if (url.includes('/101') && method === 'DELETE') {
                deleteReserveCalled = true;
                const target = mockReserves.find(r => r.id === 101);
                if (target) target.isSkip = true;
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
                return;
            }
            if (method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ reserves: mockReserves, total: mockReserves.length }),
                });
                return;
            }
            await route.continue();
        });

        await page.route('**/api/recording*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ records: [] }),
            });
        });

        await page.goto('/reserves');
        await page.waitForLoadState('networkidle');

        const table = page.locator('table');

        // 1. 各タブの初期件数表示を確認
        await expect(page.getByRole('button', { name: /すべて \(4\)/ })).toBeVisible();
        await expect(page.getByRole('button', { name: /競合 \(1\)/ })).toBeVisible();
        await expect(page.getByRole('button', { name: /スキップ \(1\)/ })).toBeVisible();
        await expect(page.getByRole('button', { name: /重複 \(1\)/ })).toBeVisible();

        // 2. 「競合」タブのフィルタ動作を検証
        const conflictTab = page.getByRole('button', { name: /競合 \(1\)/ });
        await conflictTab.click();
        await expect(table.getByText('競合発生ドラマ')).toBeVisible();
        await expect(table.getByText('通常ルール予約アニメ')).not.toBeVisible();

        // 3. 「スキップ」タブのフィルタ動作と「予約を復活」を検証
        const skipTab = page.getByRole('button', { name: /スキップ \(1\)/ });
        await skipTab.click();
        await expect(table.getByText('スキップ済みバラエティ')).toBeVisible();
        await expect(table.getByText('競合発生ドラマ')).not.toBeVisible();

        const skipRow = table.locator('tr').filter({ hasText: 'スキップ済みバラエティ' });
        const restoreBtn = skipRow.getByRole('button', { name: '復活' });
        await expect(restoreBtn).toBeVisible();
        await restoreBtn.click();

        // トースト表示と DELETE API 呼び出しの確認
        await expect.poll(() => deleteSkipCalled).toBe(true);
        await expect(page.getByText('予約を復活しました')).toBeVisible();

        // 4. 「すべて」タブに戻り、ルール予約のスキップ除外操作を検証
        const allTab = page.getByRole('button', { name: /すべて/ }).first();
        await allTab.click();
        await expect(table.getByText('通常ルール予約アニメ')).toBeVisible();

        // 通常ルール予約行のゴミ箱ボタン（スキップ）をクリック
        const normalRow = table.locator('tr').filter({ hasText: '通常ルール予約アニメ' });
        const skipActionBtn = normalRow.locator('button[title*="スキップ"]').first();
        await skipActionBtn.click();

        // 確認モーダルが表示されること
        await expect(page.getByRole('heading', { name: '録画のスキップ' })).toBeVisible();
        const confirmBtn = page.getByRole('button', { name: '実行' });
        await confirmBtn.click();

        // トースト表示と DELETE API 呼び出しの確認
        await expect.poll(() => deleteReserveCalled).toBe(true);
        await expect(page.getByText(/スキップ.*しました/)).toBeVisible();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should validate required fields, time range, cancel action, and redirect in readOnly mode on manual reserve page', async ({
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

        // 1. 手動予約ページへアクセス
        await page.goto('/reserves/manual');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1')).toContainText('時間指定手動予約');

        const submitBtn = page.getByRole('button', { name: /予約を追加/ });
        const nameInput = page.getByPlaceholder(/深夜アニメ/);
        const startTimeInput = page.locator('#manual-start-time');
        const endTimeInput = page.locator('#manual-end-time');

        // 2. 番組名が空白のみの状態で送信を試みる（ブラウザバリデーション通過後にJSバリデーション発火）
        await nameInput.fill('   ');
        await submitBtn.click();
        await expect(page.getByText('番組名を入力してください')).toBeVisible();

        // 3. 番組名を入力し、終了日時を開始日時より前に設定して送信
        await nameInput.fill('不正時刻テスト番組');
        await startTimeInput.fill('2026-10-10T12:00');
        await endTimeInput.fill('2026-10-10T11:00');
        await submitBtn.click();
        await expect(page.getByText('正しい開始・終了時刻を指定してください')).toBeVisible();

        // 4. キャンセルボタンをクリックして予約一覧へ戻ることを確認
        const cancelBtn = page.getByRole('button', { name: 'キャンセル' });
        await cancelBtn.click();
        await page.waitForURL(/\/reserves$/);
        await expect(page.locator('h1')).toContainText('予約一覧');

        // 5. 閲覧専用（readOnly）モード時のリダイレクト検証
        await page.route('**/api/config', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    readOnly: { enabled: true, showDashboard: false },
                }),
            });
        });

        await page.goto('/reserves/manual');
        await page.waitForURL(/\/recorded$/);
        await expect(page.locator('h1')).toContainText('録画一覧');

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});
