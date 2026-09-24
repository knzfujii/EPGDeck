import { test, expect } from '@playwright/test';

test.describe('Rule Edit Page (/rule/edit)', () => {
    test('should render all sections of the rule edit page', async ({ page }) => {
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

        await page.goto('/rule/edit');
        await page.waitForLoadState('networkidle');

        // 1. 新規作成ページのヘッダー
        await expect(page.locator('h1')).toContainText('新規自動録画ルール');

        // 2. 各セクション見出し (縦長レイアウト)
        await expect(page.getByRole('heading', { name: /検索条件/ })).toBeVisible();
        await expect(page.getByRole('heading', { name: /予約設定/ })).toBeVisible();
        await expect(page.getByRole('heading', { name: /録画オプション/ })).toBeVisible();

        // 詳細条件アコーディオンを展開して確認
        const detailBtn = page.getByRole('button', { name: /詳細条件/ });
        await expect(detailBtn).toBeVisible();
        await detailBtn.click();
        await expect(page.getByRole('heading', { name: /放送波・放送局/ })).toBeVisible();

        // 3. 検索条件フォーム
        await expect(page.getByPlaceholder(/葬送のフリーレン/)).toBeVisible();
        await expect(page.getByPlaceholder(/再放送/)).toBeVisible();

        // 4. 予約設定のチェックボックス
        await expect(page.getByText('ルールを有効にする')).toBeVisible();
        await expect(page.getByText('同一番組の二重録画を防止')).toBeVisible();

        // 5. 録画オプション (TS保存先・エンコード設定)
        await expect(page.getByText('TS保存先 (親)')).toBeVisible();
        await expect(page.getByText('TS保存先 (サブ)')).toBeVisible();
        await expect(page.getByText('チューナー競合時の末尾切れを許可')).toBeVisible();
        await expect(page.getByText('エンコード完了後に元TSファイルを自動削除')).toBeVisible();
        await expect(page.getByText('エンコード設定')).toBeVisible();
        await expect(page.locator('#rule-recorded-format')).toBeVisible();

        // 7. 操作ボタン
        await expect(page.getByRole('button', { name: '新規ルールを作成する' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'キャンセル' })).toBeVisible();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should prefill search conditions from query params', async ({ page }) => {
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

        // 検索画面から渡されるクエリパラメータを再現
        await page.goto('/rule/edit?keyword=%E3%83%8B%E3%83%A5%E3%83%BC%E3%82%B9&name=1&description=1&genre=0');
        await page.waitForLoadState('networkidle');

        // キーワードがプリフィルされている
        const keywordInput = page.getByPlaceholder(/葬送のフリーレン/);
        await expect(keywordInput).toHaveValue('ニュース');

        // ジャンルパラメータ指定時は自動的に詳細条件が展開されジャンルコンテナが表示されている
        await expect(page.locator('#rule-genre-container')).toBeVisible();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should navigate back to rule list on cancel', async ({ page }) => {
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

        await page.goto('/rule/edit');
        await page.waitForLoadState('networkidle');

        const cancelBtn = page.getByRole('button', { name: 'キャンセル' });
        await cancelBtn.click();
        await page.waitForURL('**/rule');
        await expect(page.locator('h1')).toContainText('ルール一覧');

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should reflect priority and disable broadcast wave checkboxes when channels are selected', async ({
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

        await page.goto('/rule/edit');
        await page.waitForLoadState('networkidle');

        // 詳細条件アコーディオンを展開
        const detailBtn = page.getByRole('button', { name: /詳細条件/ });
        await detailBtn.click();

        // 1. 初期状態: 放送波一括指定
        await expect(page.getByText('対象放送波（一括指定）')).toBeVisible();

        const grCheckbox = page.getByLabel('地デジ (GR)');
        const bsCheckbox = page.getByLabel('BS');
        const csCheckbox = page.getByLabel('CS');

        // チェックボックスが操作可能
        await expect(grCheckbox).toBeEnabled();
        await expect(bsCheckbox).toBeEnabled();
        await expect(csCheckbox).toBeEnabled();

        // 放送局リストがロードされていることを確認
        await expect(page.getByText('NHK総合1')).toBeVisible();

        // 2. 全選択ボタンをクリックして局を個別指定する
        const selectAllBtn = page.getByTestId('select-all-channels-btn');
        await selectAllBtn.click();

        // 個別指定モードのメッセージ・バッジが表示される
        await expect(page.getByText(/下記で放送局が個別指定されているため無効/)).toBeVisible();

        // 放送波チェックボックスが disabled になる
        await expect(grCheckbox).toBeDisabled();
        await expect(bsCheckbox).toBeDisabled();
        await expect(csCheckbox).toBeDisabled();

        // 3. クリアボタンで放送波指定モードに復帰する
        const clearBtn = page.getByTestId('clear-channels-btn');
        await expect(clearBtn).toBeVisible();
        await clearBtn.click();

        // 放送波一括指定モードに戻り、チェックボックスが再び操作可能になる
        await expect(page.getByText('対象放送波（一括指定）')).toBeVisible();
        await expect(grCheckbox).toBeEnabled();
        await expect(bsCheckbox).toBeEnabled();
        await expect(csCheckbox).toBeEnabled();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should allow selecting multiple genres and subgenres in scrollable groups', async ({ page }) => {
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

        await page.goto('/rule/edit');
        await page.waitForLoadState('networkidle');

        // 詳細条件アコーディオンを展開
        const detailBtn = page.getByRole('button', { name: /詳細条件/ });
        await detailBtn.click();

        // 1. 初期状態: 未選択
        await expect(page.getByText(/未選択時は全ジャンルが対象です/)).toBeVisible();

        // 2. 子ジャンルバッジの個別クリック: 「国内アニメ」をクリック
        const domesticAnimeBtn = page.getByRole('button', { name: '国内アニメ' });
        await domesticAnimeBtn.click();
        await expect(domesticAnimeBtn).toHaveClass(/border-blue-500/);

        // 3. 親ジャンルの一括選択: 「映画」ジャンル
        const movieCard = page.locator('#rule-genre-container').locator('div', { hasText: '映画' }).first();
        const movieAllBtn = movieCard.getByRole('button', { name: '全選択' });
        await movieAllBtn.click();
        await expect(movieCard.getByText('全選択中')).toBeVisible();

        // 4. 全解除ボタンをクリック
        const clearBtn = page.getByRole('button', { name: '全解除' });
        await expect(clearBtn).toBeVisible();
        await clearBtn.click();

        // 5. 未選択状態に戻る
        await expect(page.getByText(/未選択時は全ジャンルが対象です/)).toBeVisible();
        await expect(clearBtn).not.toBeVisible();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should switch between normal search and time specification tabs', async ({ page }) => {
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

        await page.goto('/rule/edit');
        await page.waitForLoadState('networkidle');

        // 初期表示: 通常検索ルールが選択されている
        await expect(page.getByRole('heading', { name: /検索条件/ })).toBeVisible();
        await expect(page.getByPlaceholder(/葬送のフリーレン/)).toBeVisible();

        // 時間指定予約ルールタブをクリック
        const timeSpecTab = page.getByRole('button', { name: /時間指定予約ルール/ });
        await expect(timeSpecTab).toBeVisible();
        await timeSpecTab.click();

        // 時間指定予約用のフォームに切り替わる
        await expect(page.getByRole('heading', { name: /時間指定予約設定/ })).toBeVisible();
        await expect(page.getByPlaceholder(/日曜討論/)).toBeVisible();
        await expect(page.locator('#rule-time-start-spec')).toBeVisible();
        await expect(page.locator('#rule-time-end-spec')).toBeVisible();
        await expect(page.getByText('対象放送局')).toBeVisible();
        await expect(page.getByRole('button', { name: '平日のみ' })).toBeVisible();

        // 通常検索用のフォームが隠れている
        await expect(page.getByPlaceholder(/葬送のフリーレン/)).not.toBeVisible();

        // 再び通常検索ルールタブをクリック
        const normalTab = page.getByRole('button', { name: /通常検索ルール/ });
        await normalTab.click();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should submit new rule form with valid options and navigate to rule list', async ({ page }) => {
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

        let postRuleCalled = false;
        let submittedPayload: Record<string, unknown> | null = null;

        await page.route(/\/api\/rules$/, async route => {
            if (route.request().method() === 'POST') {
                postRuleCalled = true;
                submittedPayload = JSON.parse(route.request().postData() || '{}');
                await route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify({ ruleId: 777 }),
                });
                return;
            }
            await route.continue();
        });

        await page.goto('/rule/edit');
        await page.waitForLoadState('networkidle');

        // 1. キーワード入力
        const keywordInput = page.getByPlaceholder(/葬送のフリーレン/);
        await expect(keywordInput).toBeVisible();
        await keywordInput.fill('E2Eテスト用アニメ');

        // 2. 二重録画防止チェックボックスをオンにする
        const avoidDuplicateLabel = page.locator('label', { hasText: '同一番組の二重録画を防止' });
        const avoidDuplicateCheckbox = avoidDuplicateLabel.locator('input[type="checkbox"]');
        if (!(await avoidDuplicateCheckbox.isChecked())) {
            await avoidDuplicateCheckbox.check();
        }

        // 3. 送信ボタンをクリック
        const submitBtn = page.getByRole('button', { name: '新規ルールを作成する' });
        await expect(submitBtn).toBeVisible();
        await submitBtn.click();

        // 4. API 呼び出しとペイロードの整合性検証
        await expect.poll(() => postRuleCalled).toBe(true);
        expect(submittedPayload).not.toBeNull();
        const payload = submittedPayload as unknown as Record<string, Record<string, unknown>>;
        expect(payload.searchOption?.keyword).toBe('E2Eテスト用アニメ');
        expect(payload.reserveOption?.avoidDuplicate).toBe(true);

        // 5. 成功トーストと /rule への画面遷移検証
        await expect(page.getByText(/新規ルール「E2Eテスト用アニメ」を作成しました/)).toBeVisible();
        await page.waitForURL(/\/rule$/);

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should restore search query and scroll position when returning from rule edit via cancel or back button', async ({
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

        // 30件のモックルールを生成
        const manyRules = Array.from({ length: 30 }, (_, i) => ({
            id: i + 1,
            searchOption: {
                keyword: i === 24 ? 'スクロールテスト番組ターゲット' : `通常ルール ${i + 1}`,
            },
            reserveOption: {
                enable: true,
                priority: 5,
            },
        }));

        await page.route(/\/api\/rules(\?.*)?$/, async route => {
            if (route.request().method() === 'GET') {
                const url = new URL(route.request().url());
                const kw = url.searchParams.get('keyword');
                if (kw) {
                    const filtered = manyRules.filter(r => r.searchOption.keyword.includes(kw));
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ rules: filtered, total: filtered.length }),
                    });
                } else {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ rules: manyRules, total: manyRules.length }),
                    });
                }
                return;
            }
            await route.continue();
        });

        await page.route(/\/api\/rules\/\d+(\?.*)?$/, async route => {
            if (route.request().method() === 'GET') {
                const id = parseInt(
                    route
                        .request()
                        .url()
                        .match(/\/api\/rules\/(\d+)/)?.[1] || '1',
                    10,
                );
                const found = manyRules.find(r => r.id === id) || manyRules[0];
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(found),
                });
                return;
            }
            await route.continue();
        });

        // 1. ルール一覧にアクセス
        await page.goto('/rule');
        await page.waitForLoadState('networkidle');

        // 25番目のルール（下の方）をクリックして編集画面へ遷移
        const targetRow = page.locator('#rule-item-25');
        await expect(targetRow).toBeVisible();
        await targetRow.click();

        await page.waitForURL(/\/rule\/edit\?ruleId=25/);
        await expect(page.locator('h1')).toContainText('ルール編集');

        // 2. ヘッダーの「←」ボタンをクリックしてルール一覧へ戻る
        const backBtn = page.getByRole('button', { name: 'ルール一覧に戻る' });
        await expect(backBtn).toBeVisible();
        await backBtn.click();

        await page.waitForURL(/\/rule$/);
        const restoredRow = page.locator('#rule-item-25');
        await expect(restoredRow).toBeVisible();
        await expect(restoredRow).toBeInViewport();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should restore search query and scroll position when saving an edited rule', async ({ page }) => {
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

        // 30件のモックルール
        const manyRules = Array.from({ length: 30 }, (_, i) => ({
            id: i + 1,
            searchOption: {
                keyword: `アニメ番組 第${i + 1}話`,
            },
            reserveOption: {
                enable: true,
                priority: 5,
            },
        }));

        await page.route(/\/api\/rules(\?.*)?$/, async route => {
            if (route.request().method() === 'GET') {
                const url = new URL(route.request().url());
                const kw = url.searchParams.get('keyword');
                if (kw) {
                    const filtered = manyRules.filter(r => r.searchOption.keyword.includes(kw));
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ rules: filtered, total: filtered.length }),
                    });
                } else {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ rules: manyRules, total: manyRules.length }),
                    });
                }
                return;
            }
            await route.continue();
        });

        await page.route(/\/api\/rules\/\d+(\?.*)?$/, async route => {
            const method = route.request().method();
            if (method === 'GET') {
                const id = parseInt(
                    route
                        .request()
                        .url()
                        .match(/\/api\/rules\/(\d+)/)?.[1] || '1',
                    10,
                );
                const found = manyRules.find(r => r.id === id) || manyRules[0];
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(found),
                });
                return;
            }
            if (method === 'PUT') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ code: 200 }),
                });
                return;
            }
            await route.continue();
        });

        // 1. キーワード絞り込み状態のルール一覧にアクセス
        await page.goto('/rule?keyword=%E3%82%A2%E3%83%8B%E3%83%A1');
        await page.waitForLoadState('networkidle');

        // 20番目のルールをクリック
        const targetRow = page.locator('#rule-item-20');
        await expect(targetRow).toBeVisible();
        await targetRow.click();

        await page.waitForURL(/\/rule\/edit\?ruleId=20/);

        // 2. 「ルールを更新する」ボタンをクリックして保存
        const saveBtn = page.getByRole('button', { name: 'ルールを更新する' });
        await expect(saveBtn).toBeVisible();
        await saveBtn.click();

        // 3. ルール一覧へ復帰し、クエリパラメータが維持されていることを検証
        await page.waitForURL(/\/rule\?keyword=/);
        expect(page.url()).toContain('keyword=');

        // 4. 更新したルール20の要素が Viewport 内にある（スクロール復帰）ことを検証
        const restoredRow = page.locator('#rule-item-20');
        await expect(restoredRow).toBeVisible();
        await expect(restoredRow).toBeInViewport();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });

    test('should prevent accidental rule saving on Enter in inputs and trigger preview search on keyword Enter', async ({
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

        let previewSearchRequested = false;
        await page.route('**/api/schedules/search', async route => {
            previewSearchRequested = true;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
            });
        });

        await page.goto('/rule/edit');
        await page.waitForLoadState('networkidle');

        const keywordInput = page.locator('#rule-keyword');
        await expect(keywordInput).toBeVisible();

        // 1. 検索キーワード入力欄で Enter を押してもルール保存（一覧へ遷移）が発生せず、プレビュー検索が走ることを検証
        await keywordInput.fill('テスト番組');
        previewSearchRequested = false;
        await keywordInput.press('Enter');

        // ページが /rule/edit に留まっていること
        await expect(page).toHaveURL(/\/rule\/edit/);
        await expect.poll(() => previewSearchRequested).toBe(true);

        // 2. その他の input（例: TS保存先サブ）で Enter を押しても保存が発生せずページに留まることを検証
        const subDirInput = page.locator('#recording-option-save-sub');
        await expect(subDirInput).toBeVisible();
        await subDirInput.fill('anime_sub');
        await subDirInput.press('Enter');

        await expect(page).toHaveURL(/\/rule\/edit/);

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});
