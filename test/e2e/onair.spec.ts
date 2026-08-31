import { test, expect } from '@playwright/test';

test.describe('OnAir Page (/onair)', () => {
    test('should display live broadcasting cards, channel filters, and modals without errors', async ({ page }) => {
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

        await page.goto('/onair');
        await page.waitForLoadState('networkidle');

        // 1. ヘッダーとタイトル
        await expect(page.locator('h1')).toContainText('放映中');

        // 2. 放送波フィルタ（すべて、地デジ、BSなど）
        await expect(page.getByRole('button', { name: 'すべて' })).toBeVisible();
        await expect(page.getByRole('button', { name: '地デジ' })).toBeVisible();

        // 3. フィルタ切り替えの動作確認
        await page.getByRole('button', { name: '地デジ' }).click();
        await page.getByRole('button', { name: 'すべて' }).click();

        // 4. 放映中番組カードが存在する場合のモーダル検証
        const playButtons = page.locator('button[aria-label="動画を再生"], button:has-text("再生する")');
        const playCount = await playButtons.count();

        if (playCount > 0) {
            // 再生モーダルを開く
            await playButtons.first().click();
            await expect(page.getByRole('heading', { name: 'ストリーム選択' })).toBeVisible();
            // 閉じる
            const closeBtn = page.getByRole('button', { name: '閉じる' }).first();
            await closeBtn.click();
        }

        // 5. エラーゼロの検証
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});

