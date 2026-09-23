import { test, expect } from '@playwright/test';

test.describe('ReadOnly Mode and Authentication Flow', () => {
    test('should restrict actions in readOnly mode and allow unlocking/locking via UnlockModal', async ({ page }) => {
        const consoleErrors: string[] = [];
        const pageErrors: string[] = [];

        page.on('console', msg => {
            if (msg.type() === 'error') {
                const text = msg.text();
                if (!text.includes('chrome-extension://') && !text.includes('favicon.ico') && !text.includes('401')) {
                    consoleErrors.push(text);
                }
            }
        });
        page.on('pageerror', err => {
            pageErrors.push(err.message);
        });

        // 1. API モック設定
        await page.route('**/api/config*', async route => {
            const response = await route.fetch();
            const config = await response.json();
            config.readOnly = {
                enabled: true,
                allowedOperations: ['liveStream', 'recordedStream'],
            };
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(config),
            });
        });

        await page.route('**/api/auth/status*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ isUnlocked: false }),
            });
        });

        await page.route('**/api/auth/unlock*', async route => {
            if (route.request().method() === 'POST') {
                const body = route.request().postDataJSON();
                if (body && body.password === 'correct_password') {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ token: 'mock-jwt-token' }),
                    });
                } else {
                    await route.fulfill({
                        status: 401,
                        contentType: 'application/json',
                        body: JSON.stringify({ message: 'Unauthorized' }),
                    });
                }
                return;
            }
            await route.continue();
        });

        await page.route('**/api/auth/lock*', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ code: 200 }),
            });
        });

        // 2. ページにアクセス
        await page.goto('/recorded');
        await page.waitForLoadState('networkidle');

        // 3. ヘッダーに「閲覧専用」バッジボタンが表示されていること
        const readOnlyBtn = page.getByRole('button', { name: /閲覧専用/ });
        await expect(readOnlyBtn).toBeVisible();

        // 4. 「閲覧専用」ボタンをクリックして UnlockModal を開く
        await readOnlyBtn.click();
        const unlockModal = page.getByRole('dialog');
        await expect(unlockModal).toBeVisible();
        await expect(page.getByRole('heading', { name: '管理者モードへの切り替え' })).toBeVisible();

        const passwordInput = unlockModal.locator('input[type="password"]');
        await expect(passwordInput).toBeVisible();

        // 5. 不正なパスワードを入力して解除を試行
        await passwordInput.fill('wrong_password');
        const submitUnlockBtn = unlockModal.getByRole('button', { name: 'ロック解除' });
        await submitUnlockBtn.click();

        // エラーメッセージが表示されること
        await expect(unlockModal.getByText('パスワードが正しくありません')).toBeVisible();
        await expect(unlockModal).toBeVisible(); // モーダルは閉じない

        // 6. 正しいパスワードを入力して解除
        await passwordInput.fill('correct_password');
        await submitUnlockBtn.click();

        // モーダルが閉じ、成功トーストが表示されること
        await expect(unlockModal).not.toBeVisible();
        await expect(page.getByText('管理者モードに切り替えました')).toBeVisible();

        // ヘッダーのボタンが「管理者モード」に変化していること
        const adminBtn = page.getByRole('button', { name: /管理者/ });
        await expect(adminBtn).toBeVisible();

        // 7. 管理者モードボタンをクリックして再ロック
        await adminBtn.click();

        // 確認ダイアログが表示されるので「ロックする」をクリック
        const confirmLockBtn = page.getByRole('button', { name: 'ロックする' });
        await expect(confirmLockBtn).toBeVisible();
        await confirmLockBtn.click();

        // スナックバー表示と、再度「閲覧専用」に戻ることを確認
        await expect(page.getByText('閲覧専用モードに戻しました')).toBeVisible();
        await expect(readOnlyBtn).toBeVisible();

        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
    });
});
