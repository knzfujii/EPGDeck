import { test, expect } from '@playwright/test';

test.describe('Watch / Playback Page (/recorded/watch, /onair/watch)', () => {
    test('should render video player container and handle navigation without fatal errors', async ({ page }) => {
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

        // 録画一覧から実際の録画IDを取得して再生ページをテスト
        await page.goto('/recorded');
        await page.waitForLoadState('networkidle');

        const firstRecordedLink = page.locator('a[href*="/recorded/detail"]').first();
        const hasRecordedItem = await firstRecordedLink.isVisible().catch(() => false);

        if (hasRecordedItem) {
            await firstRecordedLink.click();
            await page.waitForURL(/\/recorded\/detail/);

            // 録画詳細から「再生する」をクリックしてモーダルを開く
            const playButton = page.getByRole('button', { name: /再生する/ });
            await expect(playButton).toBeVisible();
            await playButton.click();

            // ストリーム選択モーダルが表示される
            await expect(page.getByRole('heading', { name: 'ストリーム選択' })).toBeVisible();

            // 再生開始リンクまたはボタンをクリック
            const streamChoice = page.locator('button:has-text("再生"), button:has-text("M2TS"), button:has-text("WebM"), button:has-text("HLS")').first();
            if (await streamChoice.isVisible().catch(() => false)) {
                await streamChoice.click();
                await page.waitForURL(/\/recorded\/watch/);

                // 動画プレーヤー本体とコントロールの存在確認
                const videoRegion = page.locator('div[role="region"][aria-label="動画プレーヤー"]');
                await expect(videoRegion).toBeVisible();

                // 戻るボタンの確認
                const backButton = page.locator('button:has-text("録画一覧に戻る"), button[aria-label="戻る"]').first();
                if (await backButton.isVisible().catch(() => false)) {
                    await backButton.click();
                    await page.waitForURL(/\/recorded/);
                }
            }
        }

        expect(pageErrors).toEqual([]);
    });
});

