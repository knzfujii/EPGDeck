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

        // 1. フィルタータブに「録画中 (1)」が表示されていることを確認
        const recordingTab = page.getByRole('button', { name: /録画中\s*\(1\)/ });
        await expect(recordingTab).toBeVisible();

        // 2. テーブル行に「現在録画中アニメ番組」と「未来の通常予約番組」が表示されていることを確認
        const table = page.getByRole('table');
        await expect(table.getByText('現在録画中アニメ番組')).toBeVisible();
        await expect(table.getByText('未来の通常予約番組')).toBeVisible();

        // 3. 録画中行のバッジ（● 録画中）と進行度（50%）および視聴ボタンを確認
        await expect(table.getByText('● 録画中')).toBeVisible();
        await expect(table.getByText(/50%/)).toBeVisible();
        const watchBtn = table.getByRole('button', { name: /視聴/ });
        await expect(watchBtn).toBeVisible();

        // 4. 「録画中 (1)」タブをクリックして絞り込み確認
        await recordingTab.click();
        await expect(table.getByText('現在録画中アニメ番組')).toBeVisible();
        await expect(table.getByText('未来の通常予約番組')).not.toBeVisible();

        // 5. 録画中行をクリックして詳細モーダルを開く
        await table.getByText('現在録画中アニメ番組').click();
        await expect(page.getByRole('dialog')).toBeVisible();

        // モーダル内の録画中バッジ、進行中テキスト、ライブ視聴ボタンを確認
        const modal = page.getByRole('dialog');
        await expect(modal.getByText('● 録画中')).toBeVisible();
        await expect(modal.getByText(/50% 進行中/)).toBeVisible();
        await expect(modal.getByRole('button', { name: 'ライブ視聴' })).toBeVisible();

        // モーダル内の「録画を停止 / 操作」ボタンをクリックすると 3択モーダルが表示されることを確認
        let finishCalled = false;
        await page.route('**/api/recording/*/finish', async route => {
            finishCalled = true;
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200 }) });
        });

        await modal.getByRole('button', { name: '録画を停止 / 操作' }).click();

        // 3択モーダル（録画中番組の操作）の表示検証
        const actionModal = page.getByRole('dialog').filter({ hasText: '録画中番組の操作' });
        await expect(actionModal).toBeVisible();
        await expect(actionModal.getByRole('button', { name: /完了として保存/ })).toBeVisible();
        await expect(actionModal.getByRole('button', { name: /中断して保存/ })).toBeVisible();
        await expect(actionModal.getByRole('button', { name: /録画を取り消し（ファイルを破棄）/ })).toBeVisible();

        // 閉じるボタンで一度モーダルを閉じる
        await actionModal.getByRole('button', { name: /何もしない（閉じる）/ }).click();
        await expect(actionModal).not.toBeVisible();

        // 再度「録画を停止 / 操作」を開いて「中断して保存」をテスト
        let stopCalled = false;
        await page.route('**/api/recording/*/stop', async route => {
            stopCalled = true;
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200 }) });
        });
        await modal.getByRole('button', { name: '録画を停止 / 操作' }).click();
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
        await modal.getByRole('button', { name: '録画を停止 / 操作' }).click();
        await expect(actionModal).toBeVisible();
        await actionModal.getByRole('button', { name: /録画を取り消し（ファイルを破棄）/ }).click();
        await expect(actionModal).not.toBeVisible();
        expect(discardCalled).toBe(true);

        // 再度展開して「完了として保存」をテスト
        await table.getByText('現在録画中アニメ番組').click();
        await modal.getByRole('button', { name: '録画を停止 / 操作' }).click();
        await expect(actionModal).toBeVisible();
        await actionModal.getByRole('button', { name: /完了として保存/ }).click();
        await expect(actionModal).not.toBeVisible();
        expect(finishCalled).toBe(true);

        // エラーゼロの検証
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});
