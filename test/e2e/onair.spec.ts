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

    test('should open program detail modal on card click, navigate to rule search, and open stream select modal', async ({
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
        const mockChannels = [
            {
                id: 1,
                serviceId: 101,
                networkId: 32736,
                name: 'テスト総合',
                halfWidthName: 'テスト総合',
                channelType: 'GR',
                channel: '27',
                hasLogoData: false,
            },
            {
                id: 2,
                serviceId: 201,
                networkId: 4,
                name: 'テストBS',
                halfWidthName: 'テストBS',
                channelType: 'BS',
                channel: 'BS01_0',
                hasLogoData: false,
            },
        ];

        const mockSchedules = [
            {
                channel: mockChannels[0],
                programs: [
                    {
                        id: 5001,
                        channelId: 1,
                        startAt: now - 15 * 60 * 1000,
                        endAt: now + 45 * 60 * 1000,
                        name: '【字】お昼のワイドニュース',
                        description: '全国の最新ニュースを詳しく解説',
                        extended: 'キャスター: 山田花子',
                        genre1: 0,
                    },
                ],
            },
            {
                channel: mockChannels[1],
                programs: [
                    {
                        id: 5002,
                        channelId: 2,
                        startAt: now - 30 * 60 * 1000,
                        endAt: now + 30 * 60 * 1000,
                        name: '世界のドキュメンタリー紀行',
                        description: '大自然の神秘と人々の暮らし',
                        genre1: 8,
                    },
                ],
            },
        ];

        await page.route(/\/api\/channels/, async route => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockChannels) });
        });
        await page.route(/\/api\/schedules/, async route => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSchedules) });
        });
        await page.route(/\/api\/recording/, async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ records: [] }),
            });
        });
        await page.route(/\/api\/reserves/, async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ reserves: [] }),
            });
        });

        await page.goto('/onair');
        await page.waitForLoadState('networkidle');

        const table = page.locator('table');

        // 1. 初期表示で2番組が描画されていること
        await expect(table.getByText('【字】お昼のワイドニュース')).toBeVisible();
        await expect(table.getByText('世界のドキュメンタリー紀行')).toBeVisible();

        // 2. 放送波フィルタで「BS」を選択 -> 「テストBS」のみが表示されること
        const bsFilterBtn = page.getByRole('button', { name: 'BS', exact: true });
        await bsFilterBtn.click();
        await expect(table.getByText('世界のドキュメンタリー紀行')).toBeVisible();
        await expect(table.getByText('【字】お昼のワイドニュース')).not.toBeVisible();

        // 「地デジ」を選択 -> 「テスト総合」のみが表示されること
        const grFilterBtn = page.getByRole('button', { name: '地デジ', exact: true });
        await grFilterBtn.click();
        await expect(table.getByText('【字】お昼のワイドニュース')).toBeVisible();
        await expect(table.getByText('世界のドキュメンタリー紀行')).not.toBeVisible();

        // 3. 番組カードをクリックして詳細ポップアップモーダルを開く
        const programCard = table.getByText('【字】お昼のワイドニュース');
        await programCard.click();

        const detailModal = page.getByRole('dialog');
        await expect(detailModal).toBeVisible();
        await expect(detailModal.getByText('番組概要')).toBeVisible();
        await expect(detailModal.getByText('全国の最新ニュースを詳しく解説')).toBeVisible();

        // 4. モーダル内の「この番組でルール作成」をクリック -> /search?keyword=... に遷移
        const createRuleBtn = detailModal.getByRole('button', { name: 'この番組でルール作成' });
        await expect(createRuleBtn).toBeVisible();
        await createRuleBtn.click();

        // 記号除去後の「お昼のワイドニュース」で /search に遷移すること
        await page.waitForURL(/\/search\?keyword=/);
        expect(page.url()).toContain(
            'keyword=%E3%81%8A%E6%98%BC%E3%81%AE%E3%83%AF%E3%82%A4%E3%83%89%E3%83%8B%E3%83%A5%E3%83%BC%E3%82%B9',
        );

        // 5. 再度 /onair に戻り、カードの「視聴」ボタンから StreamSelectModal を開く
        await page.goto('/onair');
        await page.waitForLoadState('networkidle');

        const watchBtn = table.getByRole('button', { name: '視聴' }).first();
        await expect(watchBtn).toBeVisible();
        await watchBtn.click();

        // ライブ配信設定モーダルが開くこと
        await expect(page.getByText('ライブ配信設定')).toBeVisible();
        await expect(page.getByText('チューナー確保について')).toBeVisible();
        const cancelStreamBtn = page.getByRole('button', { name: 'キャンセル' });
        await cancelStreamBtn.click();
        await expect(page.getByText('ライブ配信設定')).not.toBeVisible();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});
