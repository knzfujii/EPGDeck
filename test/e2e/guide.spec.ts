import { test, expect } from '@playwright/test';

test.describe('Guide Page (/guide)', () => {
    test('should restrict past date navigation on today and allow quick date selection up to +8 days', async ({
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

        await page.goto('/guide');

        // 1. 番組表のロード確認
        await expect(page.locator('select')).toBeVisible({ timeout: 10000 });

        // 2. 今日の状態では「前日」ボタンが disabled であること
        const prevBtn = page.getByTitle('前日');
        await expect(prevBtn).toBeDisabled();

        // 3. 日付セレクタ（select）の検証
        const dateSelect = page.locator('select');
        const options = await dateSelect.locator('option').allInnerTexts();
        expect(options.length).toBe(9); // 今日 + 8日 = 9日間
        expect(options[0]).toContain('今日');
        expect(options[1]).toContain('明日');

        // 4. 「翌日」ボタンをクリックして未来の日付へ進む
        const nextBtn = page.getByTitle('翌日');
        await expect(nextBtn).toBeEnabled();
        await nextBtn.click();

        // 5. 翌日に進んだ後は「前日」ボタンが有効化されること
        await expect(prevBtn).toBeEnabled();

        // 6. 「現在」ボタンをクリックすると今日に復帰すること
        const nowBtn = page.getByRole('button', { name: '現在' });
        await nowBtn.click();
        await expect(prevBtn).toBeDisabled();

        // 7. 放送波セレクター（「すべて」がデフォルト、および切り替え）の検証
        const allBtn = page.getByRole('button', { name: 'すべて' });
        await expect(allBtn).toBeVisible();
        await expect(allBtn).toHaveClass(/bg-white/); // アクティブ状態
        const grBtn = page.getByRole('button', { name: '地デジ' });
        if (await grBtn.isVisible()) {
            await grBtn.click();
            await expect(grBtn).toHaveClass(/bg-white/);
            await allBtn.click();
            await expect(allBtn).toHaveClass(/bg-white/);
        }

        // 8. エラーゼロの検証
        expect(pageErrors, `Page errors: ${pageErrors.join(', ')}`).toEqual([]);
        expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toEqual([]);
    });

    test('should keep timescale visible when scrolling horizontally with many channels', async ({ page }) => {
        // 30チャンネル分のモックデータを作成して横スクロールを発生させる
        const mockChannels: any[] = [];
        const mockSchedules: any[] = [];
        const now = new Date();
        now.setHours(4, 0, 0, 0);
        const startAt = now.getTime();
        const endAt = startAt + 24 * 60 * 60 * 1000;

        for (let i = 1; i <= 30; i++) {
            const ch = {
                id: i,
                serviceId: 1000 + i,
                networkId: 32736,
                name: `チャンネル${i}`,
                halfWidthName: `Ch${i}`,
                channelTypeId: 1,
                channelType: 'GR',
                channel: `${20 + i}`,
                hasLogoData: false,
            };
            mockChannels.push(ch);

            mockSchedules.push({
                channel: ch,
                programs: [
                    {
                        id: i * 1000 + 1,
                        channelId: i,
                        startAt: startAt,
                        endAt: startAt + 2 * 60 * 60 * 1000,
                        name: `番組 A - Ch ${i}`,
                        description: `番組詳細 A - Ch ${i}`,
                        genre1: 0,
                    },
                    {
                        id: i * 1000 + 2,
                        channelId: i,
                        startAt: startAt + 2 * 60 * 60 * 1000,
                        endAt: endAt,
                        name: `番組 B - Ch ${i}`,
                        description: `番組詳細 B - Ch ${i}`,
                        genre1: 1,
                    },
                ],
            });
        }

        await page.route('**/api/channels*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockChannels),
            });
        });

        await page.route('**/api/schedules*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockSchedules),
            });
        });

        await page.route('**/api/reserves*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
            });
        });

        await page.goto('/guide');

        // 番組表のロードを待機
        await expect(page.locator('text=時刻')).toBeVisible({ timeout: 10000 });

        const scrollContainer = page.locator('.overflow-auto').first();
        await expect(scrollContainer).toBeVisible();

        const timeHeader = page.locator('text=時刻');
        await expect(timeHeader).toBeVisible();

        const scrollWidth = await scrollContainer.evaluate(el => el.scrollWidth);
        const clientWidth = await scrollContainer.evaluate(el => el.clientWidth);
        console.log(`[E2E] scrollWidth: ${scrollWidth}, clientWidth: ${clientWidth}`);

        const maxScroll = scrollWidth - clientWidth;
        const scrollPositions: number[] = [];
        for (let s = 0; s <= maxScroll; s += 100) {
            scrollPositions.push(s);
        }
        if (scrollPositions[scrollPositions.length - 1] !== maxScroll) {
            scrollPositions.push(maxScroll);
        }

        for (const scrollLeft of scrollPositions) {
            await scrollContainer.evaluate((el, s) => {
                el.scrollLeft = s;
            }, scrollLeft);

            // 要素の状態を検証
            const check = await page.evaluate(() => {
                const header = Array.from(document.querySelectorAll('div')).find(
                    el => el.textContent?.trim() === '時刻' && el.classList.contains('sticky'),
                );
                if (!header) return { found: false };
                const rect = header.getBoundingClientRect();
                const container = header.closest('.overflow-auto');
                const containerRect = container?.getBoundingClientRect();

                const timeCol = header.closest('.sticky.left-0');
                const timeColRect = timeCol?.getBoundingClientRect();

                // 最前面にある要素
                const elAtCenter = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);

                return {
                    found: true,
                    timeColRect: timeColRect ? { left: timeColRect.left, width: timeColRect.width } : null,
                    containerRect: containerRect ? { left: containerRect.left, width: containerRect.width } : null,
                    elAtCenterText: elAtCenter?.textContent?.trim()?.slice(0, 30),
                };
            });

            expect(check.found).toBe(true);
            if (check.containerRect && check.timeColRect) {
                const diff = Math.abs(check.timeColRect.left - check.containerRect.left);
                expect(diff).toBeLessThanOrEqual(5);
            }

            // 最も前面が「時刻」ヘッダーであること
            expect(check.elAtCenterText).toBe('時刻');
        }
    });
});
