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
        await expect(page.locator('h1')).toContainText('放送中');

        // 2. 放送波フィルタ（すべて、地デジ、BSなど）
        await expect(page.getByRole('button', { name: 'すべて' })).toBeVisible();
        await expect(page.getByRole('button', { name: '地デジ' })).toBeVisible();

        // 3. フィルタ切り替えの動作確認
        await page.getByRole('button', { name: '地デジ' }).click();
        await page.getByRole('button', { name: 'すべて' }).click();

        // 3.1 検索バーとジャンルチップの存在確認
        await expect(page.getByPlaceholder('番組名や概要で絞り込み...')).toBeVisible();
        await expect(page.getByRole('button', { name: '全ジャンル' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'ニュース' })).toBeVisible();

        // 4. 放送中番組の視聴ボタン検証
        const watchButtons = page.getByRole('button', { name: '視聴' });
        const watchCount = await watchButtons.count();

        if (watchCount > 0) {
            // 視聴モーダルを開く
            await watchButtons.first().click();
            await expect(page.getByRole('heading', { name: /ライブ視聴/ })).toBeVisible();
            // 閉じる
            const closeBtn = page.getByRole('button', { name: '閉じる' }).first();
            await closeBtn.click();
        }

        // 5. エラーゼロの検証
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});
