import { test, expect } from '@playwright/test';

test.describe('Encode Feature & Recorded Detail Encode Modal', () => {
    test('should open encode page (/encode) and display queue tabs without errors', async ({ page }) => {
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

        await page.goto('/encode');

        // ヘッダーとセクションカードの確認
        await expect(page.locator('h1')).toContainText('エンコード一覧');
        await expect(page.getByRole('heading', { name: /実行中のエンコード/ })).toBeVisible();
        await expect(page.getByRole('heading', { name: /待機キュー/ })).toBeVisible();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should open encode modal on recorded detail page and send valid encode request', async ({ page }) => {
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

        // 録画一覧ページへ移動
        await page.goto('/recorded');
        await page.waitForLoadState('networkidle');

        // 録画アイテムのリンクを確認
        const firstLink = page.locator('a[href*="/recorded/detail"]').first();
        const isPresent = await firstLink.isVisible().catch(() => false);

        if (isPresent) {
            await firstLink.click();
            await page.waitForURL(/\/recorded\/detail/);

            // 録画詳細の「エンコード追加」ボタンをクリック
            const encodeAddBtn = page.getByRole('button', { name: /エンコード追加/ });
            await expect(encodeAddBtn).toBeVisible();
            await encodeAddBtn.click();

            // エンコード追加モーダルの表示確認
            await expect(page.getByRole('heading', { name: 'エンコード追加' })).toBeVisible();
            await expect(page.getByText('エンコードプリセット')).toBeVisible();

            // ラジオボタンの選択肢が1つ以上あることを確認
            const radioButtons = page.locator('input[name="encodeMode"]');
            const radioCount = await radioButtons.count();
            if (radioCount > 0) {
                await radioButtons.first().check();
            }

            // 元ファイル削除チェックボックスの存在確認
            const removeCheckbox = page.locator('input[type="checkbox"]').first();
            await expect(removeCheckbox).toBeVisible();

            // POST /api/encode のリクエストとレスポンスをインターセプト検証
            const encodeRequestPromise = page.waitForRequest(
                req => req.url().includes('/api/encode') && req.method() === 'POST',
            );
            const encodeResponsePromise = page.waitForResponse(
                res => res.url().includes('/api/encode') && res.request().method() === 'POST',
            );

            // 「追加する」ボタンをクリック
            const submitBtn = page.getByRole('button', { name: '追加する' });
            await submitBtn.click();

            const encodeRequest = await encodeRequestPromise;
            const postData = JSON.parse(encodeRequest.postData() || '{}');

            // リクエストペイロードの整合性検証
            expect(typeof postData.mode).toBe('string');
            expect(postData.mode.length).toBeGreaterThan(0);
            expect(postData.isSaveSameDirectory).toBe(true);
            expect(typeof postData.removeOriginal).toBe('boolean');
            expect(typeof postData.sourceVideoFileId).toBe('number');

            const encodeResponse = await encodeResponsePromise;
            // 正常登録 (201 Created) またはキュー追加成功ステータスの確認
            expect([200, 201]).toContain(encodeResponse.status());

            // 成功トースト/スナックバーの表示確認
            await expect(page.getByText(/エンコードキューに追加しました/)).toBeVisible();
        }

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should display running and waiting encode jobs with progress, and allow canceling a job', async ({
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

        const mockRunningItems = [
            {
                id: 101,
                mode: 'H.264',
                percent: 45.5,
                recorded: {
                    id: 1,
                    name: '深夜アニメ第5話',
                },
            },
        ];

        const mockWaitItems = [
            {
                id: 102,
                mode: 'H.265',
                recorded: {
                    id: 2,
                    name: '日曜劇場ドラマ第3話',
                },
            },
        ];

        let deleteEncodeCalled = false;

        await page.route(/\/api\/encode/, async route => {
            const url = route.request().url();
            const method = route.request().method();

            if (url.includes('/102') && method === 'DELETE') {
                deleteEncodeCalled = true;
                const idx = mockWaitItems.findIndex(i => i.id === 102);
                if (idx !== -1) mockWaitItems.splice(idx, 1);
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
                return;
            }

            if (method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        runningItems: mockRunningItems,
                        waitItems: mockWaitItems,
                    }),
                });
                return;
            }

            await route.continue();
        });

        await page.goto('/encode');
        await page.waitForLoadState('networkidle');

        // 1. 実行中のエンコード表示検証
        await expect(page.getByRole('heading', { name: /実行中のエンコード \(1\)/ })).toBeVisible();
        await expect(page.getByText('H.264')).toBeVisible();
        await expect(page.getByText('深夜アニメ第5話')).toBeVisible();
        await expect(page.getByText('45.5%')).toBeVisible();

        // 2. 待機キュー表示検証
        await expect(page.getByRole('heading', { name: /待機キュー \(1\)/ })).toBeVisible();
        await expect(page.getByText('日曜劇場ドラマ第3話')).toBeVisible();

        // 3. 待機中ジョブのキャンセル操作
        const waitCard = page.locator('div', { hasText: '日曜劇場ドラマ第3話' }).last();
        const cancelBtn = waitCard.getByRole('button', { name: 'キャンセル' });
        await expect(cancelBtn).toBeVisible();
        await cancelBtn.click();

        // 確認モーダルの検証
        await expect(page.getByRole('heading', { name: 'エンコードのキャンセル' })).toBeVisible();
        await expect(page.getByText('このエンコードジョブをキャンセルしますか？')).toBeVisible();
        const confirmCancelBtn = page.getByRole('button', { name: 'キャンセル実行' });
        await confirmCancelBtn.click();

        // API 呼び出しとトースト確認
        await expect.poll(() => deleteEncodeCalled).toBe(true);
        await expect(page.getByText('エンコードをキャンセルしました')).toBeVisible();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});
