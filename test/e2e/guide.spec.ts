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
        expect(options.length).toBe(8); // 今日 + 7日 = 8日間 (日本のEPG放送規格上限)
        expect(options[0]).toMatch(/\d{1,2}\/\d{1,2}\s\([日月火水木金土]\)/);
        expect(options[1]).toMatch(/\d{1,2}\/\d{1,2}\s\([日月火水木金土]\)/);
        expect(options[0]).not.toContain('今日');
        expect(options[1]).not.toContain('明日');

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
        }
    });

    test('should apply dim styling to ended programs and disable reservation in modal', async ({ page }) => {
        const pastStart = Date.now() - 2 * 60 * 60 * 1000;
        const pastEnd = Date.now() - 60 * 60 * 1000;
        const futureStart = Date.now() + 60 * 60 * 1000;
        const futureEnd = Date.now() + 2 * 60 * 60 * 1000;

        const mockChannels = [
            {
                id: 1,
                serviceId: 101,
                networkId: 32736,
                name: 'テスト局',
                halfWidthName: 'テスト局',
                channelTypeId: 1,
                channelType: 'GR',
                channel: '27',
                hasLogoData: false,
            },
        ];

        const mockSchedules = [
            {
                channel: mockChannels[0],
                programs: [
                    {
                        id: 99001,
                        channelId: 1,
                        startAt: pastStart,
                        endAt: pastEnd,
                        name: '過去の放送終了番組',
                        description: 'すでに終了した番組の概要',
                        genre1: 0,
                    },
                    {
                        id: 99002,
                        channelId: 1,
                        startAt: futureStart,
                        endAt: futureEnd,
                        name: '未来の放送予定番組',
                        description: 'これから放送される番組の概要',
                        genre1: 1,
                    },
                ],
            },
        ];

        await page.route('**/api/channels*', async route => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockChannels) });
        });
        await page.route('**/api/schedules*', async route => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSchedules) });
        });
        await page.route('**/api/reserves*', async route => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        });
        await page.route('**/api/recording*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ records: [] }),
            });
        });

        await page.goto('/guide');

        // 過去番組ボタンの描画確認
        const pastProgramBtn = page.getByRole('button', { name: /過去の放送終了番組/ });
        await expect(pastProgramBtn).toBeVisible({ timeout: 10000 });

        // 過去番組セルにディムスタイル (grayscale / opacity) が適用されていること
        await expect(pastProgramBtn).toHaveClass(/grayscale/);

        // 過去番組をクリックして詳細モーダルを開く
        await pastProgramBtn.click();

        // モーダル内に「この番組はすでに放送が終了しています」という案内が表示されること
        await expect(page.getByText('この番組はすでに放送が終了しています')).toBeVisible();

        // 予約ボタンが「放送終了」となり disabled であること
        const endedBtn = page.getByRole('button', { name: '放送終了', exact: true });
        await expect(endedBtn).toBeVisible();
        await expect(endedBtn).toBeDisabled();
    });

    test('should allow creating and canceling reservations, and navigating to search or rule edit from program modal', async ({
        page,
    }) => {
        const futureStart1 = Date.now() + 2 * 60 * 60 * 1000;
        const futureEnd1 = Date.now() + 3 * 60 * 60 * 1000;
        const futureStart2 = Date.now() + 4 * 60 * 60 * 1000;
        const futureEnd2 = Date.now() + 5 * 60 * 60 * 1000;
        const futureStart3 = Date.now() + 6 * 60 * 60 * 1000;
        const futureEnd3 = Date.now() + 7 * 60 * 60 * 1000;

        const mockChannels = [
            {
                id: 1,
                serviceId: 101,
                networkId: 32736,
                name: 'テスト総合',
                halfWidthName: 'テスト総合',
                channelTypeId: 1,
                channelType: 'GR',
                channel: '27',
                hasLogoData: false,
            },
        ];

        const mockSchedules = [
            {
                channel: mockChannels[0],
                programs: [
                    {
                        id: 99101,
                        channelId: 1,
                        startAt: futureStart1,
                        endAt: futureEnd1,
                        name: '【新】テストアニメ第1話',
                        description: '未予約のテストアニメ番組です',
                        genre1: 7,
                    },
                    {
                        id: 99102,
                        channelId: 1,
                        startAt: futureStart2,
                        endAt: futureEnd2,
                        name: '手動予約テスト番組',
                        description: '手動で予約済みのテスト番組です',
                        genre1: 0,
                    },
                    {
                        id: 99103,
                        channelId: 1,
                        startAt: futureStart3,
                        endAt: futureEnd3,
                        name: 'ルール予約テスト番組',
                        description: 'ルールによって自動予約された番組です',
                        genre1: 1,
                    },
                ],
            },
        ];

        let reserves = [
            {
                id: 501,
                programId: 99102,
                channelId: 1,
                isHalfWidth: true,
                isSkip: false,
                isConflict: false,
                ruleId: undefined,
                allowEndLack: true,
            },
            {
                id: 502,
                programId: 99103,
                channelId: 1,
                isHalfWidth: true,
                isSkip: false,
                isConflict: false,
                ruleId: 42,
                allowEndLack: true,
            },
        ];

        await page.route('**/api/channels*', async route => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockChannels) });
        });
        await page.route('**/api/schedules*', async route => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSchedules) });
        });
        await page.route('**/api/reserves*', async route => {
            if (route.request().method() === 'POST') {
                const postData = route.request().postDataJSON();
                const newReserve = {
                    id: 999,
                    programId: postData.programId,
                    channelId: 1,
                    isHalfWidth: true,
                    isSkip: false,
                    isConflict: false,
                    ruleId: undefined,
                    allowEndLack: postData.allowEndLack ?? true,
                };
                reserves.push(newReserve);
                await route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify({ reserveId: 999 }),
                });
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ reserves }),
            });
        });
        await page.route('**/api/reserves/501*', async route => {
            if (route.request().method() === 'DELETE') {
                reserves = reserves.filter(r => r.id !== 501);
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
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

        await page.goto('/guide');

        // 1. 未予約番組をクリックしてモーダルを開き、録画予約を実行
        const unreservedBtn = page.getByRole('button', { name: /【新】テストアニメ第1話/ });
        await expect(unreservedBtn).toBeVisible({ timeout: 10000 });
        await unreservedBtn.click();

        // モーダルが開いたことを確認
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect(page.getByRole('dialog').getByText('【新】テストアニメ第1話')).toBeVisible();

        // 「録画予約する」ボタンをクリック
        const addReserveBtn = page.getByRole('button', { name: '録画予約する' });
        await expect(addReserveBtn).toBeVisible();
        await addReserveBtn.click();

        // スナックバー成功通知の確認
        await expect(page.getByText('「【新】テストアニメ第1話」を録画予約しました')).toBeVisible();

        // 2. 「ルール検索へ」ボタンの遷移検証
        // 番組を再度クリックしてモーダルを開く
        await unreservedBtn.click();
        const searchRuleBtn = page.getByRole('button', { name: 'ルール検索へ' });
        await expect(searchRuleBtn).toBeVisible();
        await searchRuleBtn.click();

        // 記号が除去されたキーワードで /search に遷移すること
        await page.waitForURL(/\/search\?keyword=/);
        expect(page.url()).toContain(
            'keyword=%E3%83%86%E3%82%B9%E3%83%88%E3%82%A2%E3%83%8B%E3%83%A1%E7%AC%AC1%E8%A9%B1',
        ); // テストアニメ第1話

        // 3. 再度ガイドに戻り、手動予約済み番組の予約解除を検証
        await page.goto('/guide');
        const manualReservedBtn = page.getByRole('button', { name: /手動予約テスト番組/ });
        await expect(manualReservedBtn).toBeVisible({ timeout: 10000 });
        await manualReservedBtn.click();

        // 予約解除ボタンの確認と実行
        const cancelReserveBtn = page.getByRole('button', { name: '予約解除' });
        await expect(cancelReserveBtn).toBeVisible();
        await cancelReserveBtn.click();

        // スナックバー成功通知の確認
        await expect(page.getByText('「手動予約テスト番組」の予約を解除しました')).toBeVisible();
        await expect(page.getByRole('dialog')).not.toBeVisible();

        // 4. ルール予約番組をクリックし、「ルールを編集」ボタンの遷移検証
        const ruleReservedBtn = page.getByRole('button', { name: /ルール予約テスト番組/ });
        await expect(ruleReservedBtn).toBeVisible({ timeout: 10000 });
        await ruleReservedBtn.click();

        const editRuleBtn = page.getByRole('button', { name: 'ルールを編集' });
        await expect(editRuleBtn).toBeVisible();
        await editRuleBtn.click();

        // /rule/edit?ruleId=42 への遷移を検証
        await page.waitForURL(/\/rule\/edit\?ruleId=42/);
    });

    test('should preserve vertical scroll position across dates and fit within viewport without hiding toolbar', async ({
        page,
    }) => {
        const mockChannels = [
            {
                id: 1,
                serviceId: 101,
                networkId: 32736,
                name: 'テスト局',
                halfWidthName: 'テスト局',
                channelTypeId: 1,
                channelType: 'GR',
                channel: '27',
                hasLogoData: false,
            },
        ];

        const mockSchedules = [
            {
                channel: mockChannels[0],
                programs: [
                    {
                        id: 99001,
                        channelId: 1,
                        startAt: Date.now() - 3600000,
                        endAt: Date.now() + 3600000,
                        name: 'テスト番組 1',
                        description: '番組概要 1',
                        genre1: 0,
                    },
                ],
            },
        ];

        await page.route('**/api/channels*', async route => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockChannels) });
        });
        await page.route('**/api/schedules*', async route => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSchedules) });
        });

        await page.goto('/guide');

        // 番組表のロードを待機
        await expect(page.locator('text=時刻')).toBeVisible({ timeout: 10000 });

        const scrollContainer = page.locator('.overflow-auto').first();
        await expect(scrollContainer).toBeVisible();

        // メインコンテナのオーバースクロールがないことを検証 (日めくりUIが隠れない構造)
        const heights = await page.evaluate(() => {
            const main = document.querySelector('main');
            if (!main) return null;
            return {
                scrollHeight: main.scrollHeight,
                clientHeight: main.clientHeight,
                scrollTop: main.scrollTop,
                styleOverflowY: window.getComputedStyle(main).overflowY,
                parentHeight: main.parentElement?.clientHeight,
            };
        });
        expect(heights?.scrollHeight).toBeLessThanOrEqual((heights?.clientHeight ?? 0) + 2);

        // 縦スクロールを 1200px に設定
        await scrollContainer.evaluate(el => {
            el.scrollTop = 1200;
        });
        await page.waitForTimeout(100);

        // 翌日へ進む
        const nextBtn = page.getByTitle('翌日');
        await nextBtn.click();
        await page.waitForTimeout(400);

        // 翌日でも scrollTop が維持されていること (誤差 ±5px 以内)
        const scrollTopAfterNext = await scrollContainer.evaluate(el => el.scrollTop);
        expect(Math.abs(scrollTopAfterNext - 1200)).toBeLessThanOrEqual(5);

        // 前日に戻る
        const prevBtn = page.getByTitle('前日');
        await prevBtn.click();
        await page.waitForTimeout(400);

        // 前日でも scrollTop が維持されていること
        const scrollTopAfterPrev = await scrollContainer.evaluate(el => el.scrollTop);
        expect(Math.abs(scrollTopAfterPrev - 1200)).toBeLessThanOrEqual(5);

        // ツールバーが引き続きビューポート内で視認可能であること
        await expect(page.getByTitle('前日')).toBeInViewport();
        await expect(page.getByTitle('翌日')).toBeInViewport();
    });
});
