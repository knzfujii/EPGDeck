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
});
