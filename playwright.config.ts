import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './test/e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:18889',
        trace: 'retain-on-failure',
        headless: true,
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'npx tsx test/e2e/seed.ts && npx tsx test/e2e/e2e_server.ts',
        url: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:18889',
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
    },
});
