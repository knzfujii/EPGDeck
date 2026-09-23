import { test, expect } from '@playwright/test';

test.describe('Search and Rules Management Pages', () => {
    test('should search programs and display search options on /search', async ({ page }) => {
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

        await page.goto('/search');
        await page.waitForLoadState('networkidle');

        // 1. ヘッダーと検索バー
        await expect(page.locator('h1')).toContainText('番組検索');
        const searchInput = page.getByPlaceholder(/番組名やキーワード/);
        await expect(searchInput).toBeVisible();

        // 2. 検索実行
        await searchInput.fill('ニュース');
        const searchButton = page.getByRole('button', { name: '検索', exact: true });
        await expect(searchButton).toBeVisible();
        await searchButton.click();

        // クエリパラメータの同期検証
        await expect(page).toHaveURL(/keyword=%E3%83%8B%E3%83%A5%E3%83%BC%E3%82%B9/);

        // 3. ルール作成ボタンの存在確認
        await expect(page.getByRole('button', { name: 'この条件でルール作成' })).toBeVisible();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should prefill search input and execute search from query params', async ({ page }) => {
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

        // クエリパラメータ付きでアクセス
        await page.goto('/search?keyword=%E3%83%8B%E3%83%A5%E3%83%BC%E3%82%B9');
        await page.waitForLoadState('networkidle');

        // 検索ボックスに値がセットされ、検索が自動実行されていることを検証
        const searchInput = page.getByPlaceholder(/番組名やキーワード/);
        await expect(searchInput).toHaveValue('ニュース');
        await expect(page.getByRole('button', { name: 'この条件でルール作成' })).toBeVisible();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should allow navigating back and forth across search history with browser back/forward', async ({ page }) => {
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

        await page.goto('/search');
        await page.waitForLoadState('networkidle');

        const searchInput = page.getByPlaceholder(/番組名やキーワード/);
        const searchButton = page.getByRole('button', { name: '検索', exact: true });

        // 1回目の検索: 「ニュース」
        await searchInput.fill('ニュース');
        await searchButton.click();
        await expect(page).toHaveURL(/keyword=%E3%83%8B%E3%83%A5%E3%83%BC%E3%82%B9/);

        // 2回目の検索: 「アニメ」
        await searchInput.fill('アニメ');
        await searchButton.click();
        await expect(page).toHaveURL(/keyword=%E3%82%A2%E3%83%8B%E3%83%A1/);

        // ブラウザの戻るを実行 -> 「ニュース」の検索状態に復元
        await page.goBack();
        await expect(page).toHaveURL(/keyword=%E3%83%8B%E3%83%A5%E3%83%BC%E3%82%B9/);
        await expect(searchInput).toHaveValue('ニュース');

        // ブラウザの進むを実行 -> 「アニメ」の検索状態に復元
        await page.goForward();
        await expect(page).toHaveURL(/keyword=%E3%82%A2%E3%83%8B%E3%83%A1/);
        await expect(searchInput).toHaveValue('アニメ');

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should open rule management page (/rule) and navigate to rule edit page', async ({ page }) => {
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

        await page.goto('/rule');
        await page.waitForLoadState('networkidle');

        // 1. ルール一覧ヘッダー
        await expect(page.locator('h1')).toContainText('ルール一覧');

        // 2. ルール新規作成ボタン
        const addRuleButton = page.getByRole('button', { name: /ルール追加|新規ルール/ }).first();
        await expect(addRuleButton).toBeVisible();
        await addRuleButton.click();

        // 3. ルール編集ページ (/rule/edit) への遷移
        await page.waitForURL('**/rule/edit');
        await expect(page).toHaveURL(/\/rule\/edit(\?.*)?$/);

        // 4. 新規ルール作成ページのヘッダー確認
        await expect(page.locator('h1')).toContainText('新規自動録画ルール');

        // 5. 検索条件セクションの確認
        await expect(page.getByPlaceholder(/葬送のフリーレン/)).toBeVisible();

        // 6. 各セクション見出しの確認 (縦長レイアウト)
        await expect(page.getByRole('heading', { name: /検索条件/ })).toBeVisible();
        await expect(page.getByRole('heading', { name: /予約設定/ })).toBeVisible();
        await expect(page.getByRole('heading', { name: /録画オプション/ })).toBeVisible();

        // 詳細条件アコーディオンを展開して確認
        const detailBtn = page.getByRole('button', { name: /詳細条件/ });
        await expect(detailBtn).toBeVisible();
        await detailBtn.click();
        await expect(page.getByRole('heading', { name: /放送波・放送局/ })).toBeVisible();

        // 7. キャンセルでルール一覧に戻る
        const cancelBtn = page.getByRole('button', { name: 'キャンセル' });
        await cancelBtn.click();
        await page.waitForURL('**/rule');
        await expect(page.locator('h1')).toContainText('ルール一覧');

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should filter rules by keyword, sync URL, support browser back/forward, and clear filter', async ({
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

        const mockRules = [
            {
                id: 1,
                searchOption: { keyword: '機動戦士ガンダム' },
                reserveOption: { enable: true },
            },
            {
                id: 2,
                searchOption: { keyword: '日曜朝アニメ' },
                reserveOption: { enable: true },
            },
            {
                id: 3,
                searchOption: { keyword: 'ニュース7' },
                reserveOption: { enable: false },
                encodeOption: {
                    mode1: 'H.264',
                    mode2: 'H.265',
                    mode3: 'VP9',
                    isDeleteOriginalAfterEncode: true,
                },
            },
        ];

        await page.route('**/api/rules?*', async route => {
            const url = new URL(route.request().url());
            const kw = url.searchParams.get('keyword');
            if (kw) {
                const filtered = mockRules.filter(r => r.searchOption.keyword.includes(kw));
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ rules: filtered, total: filtered.length }),
                });
            } else {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ rules: mockRules, total: mockRules.length }),
                });
            }
        });

        await page.goto('/rule');
        await page.waitForLoadState('networkidle');

        const table = page.locator('table');

        // 1. 初期表示: 全3件
        await expect(page.locator('text=登録済みルール: 3 件')).toBeVisible();
        await expect(table.getByText('機動戦士ガンダム')).toBeVisible();
        await expect(table.getByText('日曜朝アニメ')).toBeVisible();
        await expect(table.getByText('ニュース7')).toBeVisible();
        await expect(table.getByText('H.264')).toBeVisible();
        await expect(table.getByText('H.265')).toBeVisible();
        await expect(table.getByText('VP9')).toBeVisible();
        await expect(table.getByText('TS削除')).toBeVisible();

        const searchInput = page.getByPlaceholder('ルールを検索...');
        await expect(searchInput).toBeVisible();

        // 2. キーワード検索: 「ガンダム」
        await searchInput.fill('ガンダム');
        await searchInput.press('Enter');

        // URL クエリの同期検証
        await expect(page).toHaveURL(/keyword=%E3%82%AC%E3%83%B3%E3%83%80%E3%83%A0/);
        await expect(page.locator('text=絞り込み結果: 1 件')).toBeVisible();
        await expect(table.getByText('機動戦士ガンダム')).toBeVisible();
        await expect(table.getByText('日曜朝アニメ')).not.toBeVisible();

        // アクティブキーワードバッジの表示確認
        const activeBadge = page.locator('span', { hasText: 'ガンダム' }).first();
        await expect(activeBadge).toBeVisible();

        // 3. キーワード変更: 「アニメ」
        await searchInput.fill('アニメ');
        await searchInput.press('Enter');
        await expect(page).toHaveURL(/keyword=%E3%82%A2%E3%83%8B%E3%83%A1/);
        await expect(page.locator('text=絞り込み結果: 1 件')).toBeVisible();
        await expect(table.getByText('日曜朝アニメ')).toBeVisible();
        await expect(table.getByText('機動戦士ガンダム')).not.toBeVisible();

        // 4. ブラウザの戻る操作 -> 「ガンダム」の絞り込み状態に復元
        await page.goBack();
        await expect(page).toHaveURL(/keyword=%E3%82%AC%E3%83%B3%E3%83%80%E3%83%A0/);
        await expect(searchInput).toHaveValue('ガンダム');
        await expect(page.locator('text=絞り込み結果: 1 件')).toBeVisible();
        await expect(table.getByText('機動戦士ガンダム')).toBeVisible();

        // 5. 絞り込み解除ボタンをクリック -> 全件復元
        const clearFilterBtn = page.getByRole('button', { name: '絞り込みを解除' }).first();
        await clearFilterBtn.click();
        await expect(page).toHaveURL(/\/rule(\?.*)?$/);
        await expect(page.url()).not.toContain('keyword=');
        await expect(page.locator('text=登録済みルール: 3 件')).toBeVisible();
        await expect(table.getByText('機動戦士ガンダム')).toBeVisible();
        await expect(table.getByText('ニュース7')).toBeVisible();

        // 6. 該当なしキーワードでのエンプティステート検証
        await searchInput.fill('存在しない架空タイトル');
        await searchInput.press('Enter');
        await expect(
            page.locator('text=「存在しない架空タイトル」に一致するルールは見つかりませんでした'),
        ).toBeVisible();
        const emptyClearBtn = page.locator('button.btn-secondary', { hasText: '絞り込みを解除' });
        await expect(emptyClearBtn).toBeVisible();
        await emptyClearBtn.click();
        await expect(page.locator('text=登録済みルール: 3 件')).toBeVisible();
        await expect(table.getByText('機動戦士ガンダム')).toBeVisible();

        // 7. モバイルビューポート (390x844) での動作検証
        await page.setViewportSize({ width: 390, height: 844 });
        const mobileSearchInput = page.getByPlaceholder('ルールを検索...');
        await expect(mobileSearchInput).toBeVisible();
        await mobileSearchInput.fill('ニュース');
        await mobileSearchInput.press('Enter');
        await expect(page.locator('text=絞り込み結果: 1 件')).toBeVisible();
        // モバイルカード内にニュース7およびエンコード3種バッジが表示されていること
        const mobileCard = page.locator('.md\\:hidden').filter({ hasText: 'ニュース7' });
        await expect(mobileCard).toBeVisible();
        await expect(mobileCard.getByText('H.264')).toBeVisible();
        await expect(mobileCard.getByText('H.265')).toBeVisible();
        await expect(mobileCard.getByText('VP9')).toBeVisible();
        await expect(mobileCard.getByText('TS削除')).toBeVisible();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should pass search conditions to rule edit page when clicking create rule buttons', async ({ page }) => {
        const mockPrograms = [
            {
                id: 1001,
                channelId: 1,
                startAt: Date.now() + 3600000,
                endAt: Date.now() + 7200000,
                name: '【字】スペシャル探偵物語 第1話',
                description: '難事件に挑む名探偵の活躍を描くドラマ',
                extended: '出演: 山田太郎 ほか',
                genre1: 3,
                channel: {
                    id: 1,
                    serviceId: 101,
                    networkId: 32736,
                    name: 'テスト総合',
                    halfWidthName: 'テスト総合',
                    channelType: 'GR',
                    channel: '27',
                },
            },
        ];

        await page.route('**/api/schedules/search*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockPrograms),
            });
        });

        await page.goto('/search');
        await page.waitForLoadState('networkidle');

        // 1. 検索バーにキーワードを入力して検索
        const searchInput = page.getByPlaceholder(/番組名やキーワード/);
        await searchInput.fill('探偵物語');
        const searchBtn = page.getByRole('button', { name: '検索', exact: true });
        await searchBtn.click();

        // 検索結果カードが表示されることを確認
        await expect(page.getByText('【字】スペシャル探偵物語 第1話')).toBeVisible();

        // 2. 「この条件でルール作成」ボタンをクリック
        const createRuleFromConditionBtn = page.getByRole('button', { name: 'この条件でルール作成' });
        await expect(createRuleFromConditionBtn).toBeVisible();
        await createRuleFromConditionBtn.click();

        // /rule/edit に遷移し、クエリパラメータと入力欄にキーワードが引き継がれていることを確認
        await page.waitForURL(/\/rule\/edit\?.*keyword=/);
        expect(page.url()).toContain('keyword=%E6%8E%A2%E5%81%B5%E7%89%A9%E8%AA%9E'); // 探偵物語
        const ruleKeywordInput = page.getByPlaceholder('例: 葬送のフリーレン');
        await expect(ruleKeywordInput).toHaveValue('探偵物語');

        // 3. 再度 /search に戻り、番組カードの「ルール作成」ボタンをクリック
        await page.goto('/search?keyword=%E6%8E%A2%E5%81%B5%E7%89%A9%E8%AA%9E');
        await page.waitForLoadState('networkidle');
        await expect(page.getByText('【字】スペシャル探偵物語 第1話')).toBeVisible();

        // 番組カード内の「ルール作成」ボタンをクリック
        const cardRuleBtn = page.getByRole('button', { name: 'ルール作成', exact: true });
        await expect(cardRuleBtn).toBeVisible();
        await cardRuleBtn.click();

        // /rule/edit に遷移し、記号除去後のタイトル（「スペシャル探偵物語」）がプリフィルされていること
        await page.waitForURL(/\/rule\/edit\?.*keyword=/);
        await expect(ruleKeywordInput).toHaveValue('スペシャル探偵物語');
    });

    test('should allow toggling rule enable status and deleting rule from rule list', async ({ page }) => {
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

        const mockRules = [
            {
                id: 501,
                searchOption: {
                    keyword: 'アニメ「勇者物語」',
                },
                targetOption: {},
                saveOption: {},
                encodeOption: {},
                reserveOption: {
                    enable: true,
                },
            },
        ];

        let disableRuleCalled = false;
        let enableRuleCalled = false;
        let deleteRuleCalled = false;

        await page.route(/\/api\/rules/, async route => {
            const url = route.request().url();
            const method = route.request().method();

            if (url.includes('/501/disable') && method === 'PUT') {
                disableRuleCalled = true;
                mockRules[0].reserveOption.enable = false;
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
                return;
            }

            if (url.includes('/501/enable') && method === 'PUT') {
                enableRuleCalled = true;
                mockRules[0].reserveOption.enable = true;
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
                return;
            }

            if (url.includes('/501') && method === 'DELETE') {
                deleteRuleCalled = true;
                mockRules.length = 0;
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
                return;
            }

            if (method === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        rules: mockRules,
                        total: mockRules.length,
                    }),
                });
                return;
            }

            await route.continue();
        });

        await page.goto('/rule');
        await page.waitForLoadState('networkidle');

        const table = page.locator('table');

        // 1. 初期表示でルールが描画されていること
        await expect(table.getByText('アニメ「勇者物語」')).toBeVisible();

        // 2. 有効状態のスイッチ（無効化ボタン）をクリック
        const disableBtn = table.locator('button[title="クリックして無効化"]').first();
        await expect(disableBtn).toBeVisible();
        await disableBtn.click();

        // PUT /api/rules/501/disable の呼び出しとトースト確認
        await expect.poll(() => disableRuleCalled).toBe(true);
        await expect(page.getByText('ルールを無効にしました')).toBeVisible();

        // 3. 無効状態のスイッチ（有効化ボタン）をクリック
        const enableBtn = table.locator('button[title="クリックして有効化"]').first();
        await expect(enableBtn).toBeVisible();
        await enableBtn.click();

        // PUT /api/rules/501/enable の呼び出しとトースト確認
        await expect.poll(() => enableRuleCalled).toBe(true);
        await expect(page.getByText('ルールを有効にしました')).toBeVisible();

        // 4. 削除ボタンをクリック -> 確認モーダル -> 削除実行
        const row = table.locator('tr').filter({ hasText: 'アニメ「勇者物語」' });
        const deleteActionBtn = row.locator('button[title="削除"]');
        await expect(deleteActionBtn).toBeVisible();
        await deleteActionBtn.click();

        // 確認モーダルが表示されること
        const confirmModal = page.getByRole('dialog');
        await expect(confirmModal.getByRole('heading', { name: 'ルールの削除' })).toBeVisible();
        await expect(confirmModal.getByText(/ルール「アニメ「勇者物語」」を削除しますか？/)).toBeVisible();

        const confirmDeleteBtn = confirmModal.getByRole('button', { name: '削除' });
        await confirmDeleteBtn.click();

        // DELETE /api/rules/501 の呼び出しとトースト確認
        await expect.poll(() => deleteRuleCalled).toBe(true);

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});
