import { test, expect } from '@playwright/test';

test.describe('Dashboard Page (/)', () => {
    test('should display overview metrics and integrated storage usage cards', async ({ page }) => {
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

        // 1. 予約一覧・録画一覧の見出し
        const main = page.locator('main');
        await expect(main.getByRole('heading', { name: '予約一覧' })).toBeVisible();
        await expect(main.getByRole('heading', { name: '録画一覧' })).toBeVisible();

        // 2. ダッシュボードに統合されたストレージ容量カード
        const storageCardBtn = main.getByRole('button', { name: /ストレージ容量/ });
        await expect(storageCardBtn).toBeVisible();
        await expect(page.getByText(/\d+ ドライブ/)).toBeVisible();

        // アコーディオンを展開して詳細数値を検証
        await storageCardBtn.click();
        await expect(page.getByText(/使用:/).first()).toBeVisible();
        await expect(page.getByText(/空き:/).first()).toBeVisible();
        await expect(page.getByText(/合計:/).first()).toBeVisible();

        // 3. サイドバーに単独の「ストレージ」メニュー項目が存在しないこと（ダッシュボード統合による整理）
        const sidebar = page.locator('aside');
        await expect(sidebar.getByRole('button', { name: 'ストレージ' })).toHaveCount(0);

        // 4. エラーゼロの検証
        expect(pageErrors, `Page errors: ${pageErrors.join(', ')}`).toEqual([]);
        expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toEqual([]);
    });

    test('should display active recording card with progress bar, support action modal, and show warning alerts accordion', async ({
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
        const recordingReserve = {
            id: 801,
            programId: 9001,
            channelId: 1,
            name: 'ダッシュボード録画中番組',
            startAt: now - 15 * 60 * 1000,
            endAt: now + 45 * 60 * 1000,
            isHalfWidth: true,
            isSkip: false,
            isConflict: false,
            isOverlap: false,
            allowEndLack: true,
        };

        const conflictReserve = {
            id: 802,
            programId: 9002,
            channelId: 1,
            name: 'ダッシュボード競合番組',
            startAt: now + 60 * 60 * 1000,
            endAt: now + 120 * 60 * 1000,
            isHalfWidth: true,
            isSkip: false,
            isConflict: true,
            isOverlap: false,
            allowEndLack: true,
        };

        const overlapReserve = {
            id: 803,
            programId: 9003,
            channelId: 1,
            name: 'ダッシュボード重複番組',
            startAt: now + 180 * 60 * 1000,
            endAt: now + 240 * 60 * 1000,
            isHalfWidth: true,
            isSkip: false,
            isConflict: false,
            isOverlap: true,
            allowEndLack: true,
        };

        const recordingRecord = {
            id: 801,
            programId: 9001,
            channelId: 1,
            name: 'ダッシュボード録画中番組',
            startAt: now - 15 * 60 * 1000,
            endAt: now + 45 * 60 * 1000,
            isRecording: true,
        };

        await page.route('**/api/recording*', async route => {
            if (route.request().url().includes('/stop')) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ code: 200 }),
                });
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ records: [recordingRecord] }),
            });
        });

        await page.route('**/api/reserves*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    reserves: [recordingReserve, conflictReserve, overlapReserve],
                    total: 3,
                }),
            });
        });

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // 1. 録画中カードの表示確認（● 録画中 バッジ、タイトル、視聴ボタン、停止ボタン）
        await expect(page.getByText('● 録画中')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'ダッシュボード録画中番組' })).toBeVisible();

        const watchBtn = page.getByRole('button', { name: '視聴', exact: true });
        await expect(watchBtn).toBeVisible();

        const stopBtn = page.getByRole('button', { name: '停止', exact: true });
        await expect(stopBtn).toBeVisible();

        // 2. 「停止」ボタンをクリックして RecordingActionModal を開く
        await stopBtn.click();
        const actionModal = page.getByRole('dialog');
        await expect(actionModal).toBeVisible();
        await expect(actionModal.getByText('録画中番組の操作')).toBeVisible();

        // 3択（完了として保存 / 中断して保存 / 録画を取り消し）の選択肢が表示されていること
        await expect(actionModal.getByText('完了として保存')).toBeVisible();
        await expect(actionModal.getByText('中断して保存')).toBeVisible();
        await expect(actionModal.getByText('録画を取り消し')).toBeVisible();

        // モーダルを「何もしない（閉じる）」で閉じる
        const cancelBtn = actionModal.getByRole('button', { name: '何もしない（閉じる）' });
        await cancelBtn.click();
        await expect(actionModal).not.toBeVisible();

        // 3. 予約警告アコーディオン（競合・重複スキップ）の検証
        const alertAccordionBtn = page.getByRole('button', { name: /予約の注意・警告/ });
        await expect(alertAccordionBtn).toBeVisible();
        await expect(page.getByText('競合 1件')).toBeVisible();
        await expect(page.getByText('重複スキップ 1件')).toBeVisible();

        // アコーディオンを展開
        await alertAccordionBtn.click();
        await expect(page.getByText('ダッシュボード競合番組').first()).toBeVisible();
        await expect(page.getByText('ダッシュボード重複番組').first()).toBeVisible();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});
