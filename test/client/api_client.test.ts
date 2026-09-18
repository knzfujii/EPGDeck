import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../../client/src/lib/apiClient.js';

describe('Hono RPC apiClient', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('has type-safe endpoint callers matching apiRoutes', () => {
        expect(api).toBeDefined();
        expect(typeof api.reserves.$get).toBe('function');
        expect(typeof api.recorded.$get).toBe('function');
        expect(typeof api.channels.$get).toBe('function');
        expect(typeof api.rules.$get).toBe('function');
    });

    it('injects Authorization header when auth token is stored', async () => {
        let capturedHeaders: Headers | undefined;
        const mockFetch = vi.fn().mockImplementation((_input: any, init: any) => {
            capturedHeaders = new Headers(init?.headers);
            return Promise.resolve(new Response(JSON.stringify({ version: '1.0.0' }), { status: 200 }));
        });

        // localStorage のモック
        const originalLocalStorage = global.localStorage;
        (global as any).localStorage = {
            getItem: vi.fn().mockReturnValue('mock-token-xyz'),
            setItem: vi.fn(),
            removeItem: vi.fn(),
            clear: vi.fn(),
            length: 0,
            key: vi.fn(),
        };
        (global as any).window = global;
        global.fetch = mockFetch;

        const res = await api.version.$get();
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.version).toBe('1.0.0');
        expect(capturedHeaders?.get('Authorization')).toBe('Bearer mock-token-xyz');

        (global as any).localStorage = originalLocalStorage;
    });

    it('supports query parameters and constructs URL properly', async () => {
        let capturedUrl: string | undefined;
        const mockFetch = vi.fn().mockImplementation((input: any) => {
            capturedUrl = typeof input === 'string' ? input : input.url;
            return Promise.resolve(new Response(JSON.stringify({ rules: [], total: 0 }), { status: 200 }));
        });
        global.fetch = mockFetch;

        const res = await api.rules.$get({
            query: {
                limit: 10,
                offset: 20,
            },
        });
        expect(res.status).toBe(200);
        expect(capturedUrl).toContain('limit=10');
        expect(capturedUrl).toContain('offset=20');
    });
});
