import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * 録画一覧から先頭の録画を選択し、ストリーム選択モーダルを経て動画再生画面を開くヘルパー
 */
async function openFirstRecordedWatchPage(page: Page): Promise<Locator | null> {
    await page.goto('/recorded');
    await page.waitForLoadState('networkidle');

    const firstRecordedLink = page.locator('a[href*="/recorded/detail"]').first();
    await firstRecordedLink.waitFor({ timeout: 5000 }).catch(() => null);
    if (!(await firstRecordedLink.isVisible().catch(() => false))) {
        return null;
    }

    await firstRecordedLink.click();
    await page.waitForURL(/\/recorded\/detail/);

    const playButton = page.getByRole('button', { name: /詳細再生|動画を再生|再生/ }).first();
    if (!(await playButton.isVisible().catch(() => false))) {
        return null;
    }
    await playButton.click();

    const streamChoice = page
        .locator('button:has-text("再生"), button:has-text("M2TS"), button:has-text("WebM"), button:has-text("HLS")')
        .first();
    if (!(await streamChoice.isVisible().catch(() => false))) {
        return null;
    }
    await streamChoice.click();
    await page.waitForURL(/\/recorded\/watch/);

    const videoRegion = page.locator('div[role="region"][aria-label="動画プレーヤー"]');
    await expect(videoRegion).toBeVisible();
    return videoRegion;
}

test.describe('Watch / Playback Page (/recorded/watch, /onair/watch)', () => {
    test('should render video player container and handle navigation without fatal errors', async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', err => pageErrors.push(err.message));

        const videoRegion = await openFirstRecordedWatchPage(page);
        if (videoRegion) {
            const backButton = page.locator('button:has-text("録画一覧に戻る"), button[aria-label="戻る"]').first();
            if (await backButton.isVisible().catch(() => false)) {
                await backButton.click();
                await page.waitForURL(/\/recorded/);
            }
        }

        expect(pageErrors).toEqual([]);
    });

    test('should toggle controls on overlay click and support center quick actions', async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', err => pageErrors.push(err.message));

        const videoRegion = await openFirstRecordedWatchPage(page);
        if (videoRegion) {
            const centerPlayButton = videoRegion.getByRole('button', { name: /^(再生|一時停止)$/ }).first();
            await expect(centerPlayButton).toBeVisible();

            // 背景オーバーレイをクリックするとコントロールが非表示になる
            const overlay = videoRegion.locator('button[aria-label*="コントロール"]').first();
            await expect(overlay).toBeVisible();
            await overlay.click();

            await expect(centerPlayButton).not.toBeVisible();

            // コントロール非表示時に画面をクリックするとコントロールが再表示される
            await overlay.click();
            await expect(centerPlayButton).toBeVisible();
        }

        expect(pageErrors).toEqual([]);
    });

    test('should show center quick actions and handle tap controls in mobile viewport', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        const pageErrors: string[] = [];
        page.on('pageerror', err => pageErrors.push(err.message));

        const videoRegion = await openFirstRecordedWatchPage(page);
        if (videoRegion) {
            const centerPlayButton = videoRegion.getByRole('button', { name: /^(再生|一時停止)$/ }).first();
            await expect(centerPlayButton).toBeVisible();

            // スマホタップでコントロールを非表示/再表示
            const overlay = videoRegion.locator('button[aria-label*="コントロール"]').first();
            await overlay.tap();
            await expect(centerPlayButton).not.toBeVisible();

            // コントロール非表示時に、下部コントロールが存在した領域（画面下部）をタップしても
            // 下部パーツの誤動作にならず、コントロールが正常に再表示されること
            const box = await videoRegion.boundingBox();
            if (box) {
                await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height - 20);
                await expect(centerPlayButton).toBeVisible();

                // 再度非表示にして、パーツが存在しない上部領域をタップしても正常に再表示されること
                await overlay.tap();
                await expect(centerPlayButton).not.toBeVisible();

                await page.touchscreen.tap(box.x + box.width / 2, box.y + 30);
                await expect(centerPlayButton).toBeVisible();
            }
        }

        expect(pageErrors).toEqual([]);
    });

    test('should control playback rate, mute, and handle keyboard shortcuts in video player', async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', err => pageErrors.push(err.message));

        const mockRecorded = {
            id: 9902,
            channelId: 1,
            startAt: Date.now() - 3600000,
            endAt: Date.now() - 1800000,
            duration: 1800,
            name: '動画プレーヤー操作テスト番組',
            description: '再生速度・音量・ショートカット検証用',
            extended: '',
            genre1: 0,
            isProtected: false,
            videoFiles: [
                {
                    id: 9002,
                    name: 'MP4',
                    filename: 'test_player.mp4',
                    type: 'encoded',
                    size: 1024 * 1024 * 300,
                },
            ],
        };

        await page.route(/\/api\/recorded\/9902/, async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockRecorded),
            });
        });

        await page.route(/\/api\/videos\/9002\/duration/, async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ duration: 1800 }),
            });
        });

        await page.route(/\/api\/videos\/9002(\?.*)?$/, async route => {
            await route.fulfill({
                status: 200,
                contentType: 'video/mp4',
                body: Buffer.from([]),
            });
        });

        await page.addInitScript(() => {
            HTMLMediaElement.prototype.play = async () => {};
            HTMLMediaElement.prototype.load = () => {};
            Object.defineProperty(HTMLMediaElement.prototype, 'duration', { get: () => 1800 });
            Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { get: () => 4 });
            const origAdd = HTMLMediaElement.prototype.addEventListener;
            HTMLMediaElement.prototype.addEventListener = function (
                type: string,
                listener: EventListenerOrEventListenerObject,
                options?: boolean | AddEventListenerOptions,
            ) {
                if (type === 'error') return;
                return origAdd.call(this, type, listener, options);
            };
        });

        await page.goto('/recorded/watch?recordedId=9902&videoId=9002');
        await page.waitForLoadState('networkidle');

        // videoElement の loadedmetadata を発火させてコントロールを有効化
        await page.evaluate(() => {
            const v = document.querySelector('video');
            if (v) {
                v.dispatchEvent(new Event('loadedmetadata'));
                v.dispatchEvent(new Event('play'));
            }
        });

        // 動画プレーヤーコンテナが表示されていること
        const videoRegion = page.locator('div[role="region"][aria-label="動画プレーヤー"]');
        await expect(videoRegion).toBeVisible();

        // コントロールを表示するためにプレーヤー上をホバー
        await videoRegion.hover();

        // 番組タイトルが描画されていること
        await expect(page.locator('h1')).toContainText('動画プレーヤー操作テスト番組');

        // 1. 再生速度（倍速）ボタンの動作検証
        // デフォルトは 1.0x（bg-blue-600）
        const rate15Btn = videoRegion.getByRole('button', { name: '1.5x' });
        await expect(rate15Btn).toBeVisible();
        await rate15Btn.click();
        await expect(rate15Btn).toHaveClass(/bg-blue-600/);

        const rate20Btn = videoRegion.getByRole('button', { name: '2x' });
        await expect(rate20Btn).toBeVisible();
        await rate20Btn.click();
        await expect(rate20Btn).toHaveClass(/bg-blue-600/);

        // 1.0x に戻す
        const rate10Btn = videoRegion.getByRole('button', { name: '1x' });
        await rate10Btn.click();
        await expect(rate10Btn).toHaveClass(/bg-blue-600/);

        // 2. 音量消音（Mute）ボタンの検証
        const muteBtn = videoRegion.locator('button[title*="ミュート (M)"]');
        await expect(muteBtn).toBeVisible();
        await muteBtn.click();

        // 消音状態になるとタイトルが「ミュート解除 (M)」に変化すること
        const unmuteBtn = videoRegion.locator('button[title*="ミュート解除 (M)"]');
        await expect(unmuteBtn).toBeVisible();

        // 3. キーボードショートカット 'm' による消音解除・トグル動作
        await page.keyboard.press('m');
        await expect(muteBtn).toBeVisible();

        await page.keyboard.press('m');
        await expect(unmuteBtn).toBeVisible();

        // 再度 'm' で解除
        await page.keyboard.press('m');
        await expect(muteBtn).toBeVisible();

        expect(pageErrors).toEqual([]);
    });

    test('should maintain seek position without resetting to 0 when seeking in WebM stream', async ({ page }) => {
        const pageErrors: string[] = [];
        page.on('pageerror', err => pageErrors.push(err.message));

        const mockRecorded = {
            id: 9903,
            channelId: 1,
            startAt: Date.now() - 3600000,
            endAt: Date.now() - 1800000,
            duration: 1800 * 1000,
            name: 'WebMシーク検証テスト番組',
            description: 'WebMシーク時のポジション保持検証用',
            extended: '',
            genre1: 0,
            isProtected: false,
            videoFiles: [
                {
                    id: 9003,
                    name: 'TS',
                    filename: 'test_webm.ts',
                    type: 'ts',
                    size: 1024 * 1024 * 500,
                },
            ],
        };

        await page.route(/\/api\/recorded\/9903/, async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockRecorded),
            });
        });

        await page.route(/\/api\/videos\/9003\/duration/, async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ duration: 1800 }),
            });
        });

        let requestedSs: string | null = null;
        await page.route(/\/api\/streams\/recorded\/9003\/webm/, async route => {
            const url = new URL(route.request().url());
            requestedSs = url.searchParams.get('ss');
            await route.fulfill({
                status: 200,
                contentType: 'video/webm',
                body: Buffer.from([]),
            });
        });

        await page.addInitScript(() => {
            HTMLMediaElement.prototype.play = async () => {};
            HTMLMediaElement.prototype.load = () => {};
            Object.defineProperty(HTMLMediaElement.prototype, 'duration', { get: () => Infinity });
            Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { get: () => 4 });
            const origAdd = HTMLMediaElement.prototype.addEventListener;
            HTMLMediaElement.prototype.addEventListener = function (
                type: string,
                listener: EventListenerOrEventListenerObject,
                options?: boolean | AddEventListenerOptions,
            ) {
                if (type === 'error') return;
                return origAdd.call(this, type, listener, options);
            };
        });

        await page.goto('/recorded/watch?recordedId=9903&videoFileId=9003&type=webm&mode=0');
        await page.waitForLoadState('networkidle');

        // videoElement の loadedmetadata & playing を発火させて初期表示
        await page.evaluate(() => {
            const v = document.querySelector('video');
            if (v) {
                v.dispatchEvent(new Event('loadedmetadata'));
                v.dispatchEvent(new Event('playing'));
            }
        });

        const videoRegion = page.locator('div[role="region"][aria-label="動画プレーヤー"]');
        await expect(videoRegion).toBeVisible();
        await videoRegion.hover();

        // 30秒進むボタンをクリックしてシークを実行
        const forwardBtn = videoRegion.getByRole('button', { name: '30秒進む' });
        await expect(forwardBtn).toBeVisible();
        await forwardBtn.click();

        // サーバーに対して ss=30 で再リクエストが送信されたことを確認
        await expect.poll(() => requestedSs).toBe('30');

        // シーク後、シークバーの値が 0 にリセットされずに 30 以上を維持していることを検証
        const seekInput = videoRegion.locator('input[type="range"]').first();
        const seekValue = await seekInput.inputValue();
        expect(Number(seekValue)).toBeGreaterThanOrEqual(30);

        // 時間表示テキストも 00:00 ではなく 00:30 以上が表示されていること
        await expect(videoRegion.locator('span:has-text("00:30")').first()).toBeVisible();

        expect(pageErrors).toEqual([]);
    });
});
