(globalThis as any).$state = (val: any) => val;

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateFaviconSvg, updateFavicon } from '../../client/src/lib/utils/favicon.js';

describe('Favicon Utility Tests', () => {
    describe('generateFaviconSvg', () => {
        it('returns SVG with slate gray center and no badge when standby (neither recording nor encoding)', () => {
            const svg = generateFaviconSvg(false, false);
            expect(svg).toContain('stop-color="#94a3b8"');
            expect(svg).toContain('stop-color="#64748b"');
            expect(svg).not.toContain('stop-color="#ff5252"');
            expect(svg).not.toContain('favicon-enc-badge');
        });

        it('returns SVG with red center and no badge when recording only', () => {
            const svg = generateFaviconSvg(true, false);
            expect(svg).toContain('stop-color="#ff5252"');
            expect(svg).toContain('stop-color="#dc2626"');
            expect(svg).not.toContain('stop-color="#94a3b8"');
            expect(svg).not.toContain('favicon-enc-badge');
        });

        it('returns SVG with slate center and green badge when encoding only', () => {
            const svg = generateFaviconSvg(false, true);
            expect(svg).toContain('stop-color="#94a3b8"');
            expect(svg).toContain('stop-color="#64748b"');
            expect(svg).not.toContain('stop-color="#ff5252"');
            expect(svg).toContain('favicon-enc-badge');
            expect(svg).toContain('fill="#10b981"');
        });

        it('returns SVG with red center and green badge when both recording and encoding', () => {
            const svg = generateFaviconSvg(true, true);
            expect(svg).toContain('stop-color="#ff5252"');
            expect(svg).toContain('stop-color="#dc2626"');
            expect(svg).not.toContain('stop-color="#94a3b8"');
            expect(svg).toContain('favicon-enc-badge');
            expect(svg).toContain('fill="#10b981"');
        });
    });

    describe('updateFavicon DOM updates', () => {
        let mockSvgLink: any;
        let mockPngLink: any;

        beforeEach(() => {
            mockSvgLink = {
                rel: 'icon',
                type: 'image/svg+xml',
                href: '/icon/favicon.svg',
                dataset: {},
            };
            mockPngLink = {
                rel: 'icon',
                type: 'image/png',
                href: '/icon/favicon.png',
                dataset: {},
            };

            const links = [mockSvgLink, mockPngLink];
            vi.stubGlobal('document', {
                querySelectorAll: vi.fn((selector: string) => {
                    if (selector.includes('icon')) {
                        return links;
                    }
                    return [];
                }),
                createElement: vi.fn(),
                head: {
                    appendChild: vi.fn(),
                },
            });
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('updates all icon link elements to data:image/svg+xml and saves originalHref', () => {
            const testSvg = '<svg>test</svg>';
            updateFavicon(testSvg);

            expect(mockSvgLink.dataset.originalHref).toBe('/icon/favicon.svg');
            expect(mockPngLink.dataset.originalHref).toBe('/icon/favicon.png');
            expect(mockSvgLink.href).toContain('data:image/svg+xml,');
            expect(mockPngLink.href).toContain('data:image/svg+xml,');
        });

        it('restores originalHref when svgContent is null', () => {
            const testSvg = '<svg>test</svg>';
            updateFavicon(testSvg);
            updateFavicon(null);

            expect(mockSvgLink.href).toBe('/icon/favicon.svg');
            expect(mockPngLink.href).toBe('/icon/favicon.png');
            expect(mockSvgLink.dataset.originalHref).toBeUndefined();
            expect(mockPngLink.dataset.originalHref).toBeUndefined();
        });
    });
});

const mockRecordingGet = vi.fn();
const mockEncodeGet = vi.fn();
const socketCallbacks: Record<string, () => void> = {};

vi.mock('../../client/src/lib/apiClient.js', () => ({
    api: {
        recording: { $get: (...args: any[]) => mockRecordingGet(...args) },
        encode: { $get: (...args: any[]) => mockEncodeGet(...args) },
    },
    default: {
        recording: { $get: (...args: any[]) => mockRecordingGet(...args) },
        encode: { $get: (...args: any[]) => mockEncodeGet(...args) },
    },
}));

vi.mock('../../client/src/lib/stores/socket.svelte.js', () => ({
    socketStore: {
        on: vi.fn((event: string, cb: () => void) => {
            socketCallbacks[event] = cb;
            return () => delete socketCallbacks[event];
        }),
    },
}));

const mockReadOnlyStore = {
    isInitialized: true,
    canViewDashboard: true,
    canViewEncode: true,
    isReadOnly: false,
};

vi.mock('../../client/src/lib/stores/readOnly.svelte.js', () => ({
    readOnlyStore: mockReadOnlyStore,
}));

describe('FaviconStore Tests', () => {
    let FaviconStoreClass: any;
    let store: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.stubGlobal('window', {});
        vi.stubGlobal('document', {
            querySelectorAll: vi.fn(() => []),
            createElement: vi.fn(() => ({})),
            head: { appendChild: vi.fn() },
        });

        mockRecordingGet.mockResolvedValue({
            ok: true,
            json: async () => ({ records: [{ id: 1 }], total: 1 }),
        });

        mockEncodeGet.mockResolvedValue({
            ok: true,
            json: async () => ({ runningItems: [{ id: 10 }] }),
        });

        const modulePath = '../../client/src/lib/stores/favicon.svelte.js';
        const mod = await import(/* @vite-ignore */ modulePath);
        FaviconStoreClass = mod.FaviconStore;
        store = new FaviconStoreClass();
    });

    afterEach(() => {
        store.destroy();
        vi.unstubAllGlobals();
    });

    it('initializes and fetches recording and encoding states', async () => {
        store.init();
        await store.checkAll();

        expect(store.isRecording).toBe(true);
        expect(store.isEncoding).toBe(true);
        expect(mockRecordingGet).toHaveBeenCalled();
        expect(mockEncodeGet).toHaveBeenCalled();
    });

    it('updates state when socket event occurs', async () => {
        store.init();
        await store.checkAll();
        expect(store.isRecording).toBe(true);

        // 録画が終了した場合
        mockRecordingGet.mockResolvedValue({
            ok: true,
            json: async () => ({ records: [], total: 0 }),
        });

        socketCallbacks['updateStatus']?.();
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(store.isRecording).toBe(false);
        expect(store.isEncoding).toBe(true);
    });

    it('resets state on destroy', async () => {
        store.init();
        await store.checkAll();
        expect(store.isRecording).toBe(true);

        store.destroy();
        expect(store.isRecording).toBe(false);
        expect(store.isEncoding).toBe(false);
    });

    it('skips fetching when readOnlyStore restricts dashboard or encode access', async () => {
        mockReadOnlyStore.canViewDashboard = false;
        mockReadOnlyStore.canViewEncode = false;

        store.init();
        await store.checkAll();

        expect(store.isRecording).toBe(false);
        expect(store.isEncoding).toBe(false);
        expect(mockRecordingGet).not.toHaveBeenCalled();
        expect(mockEncodeGet).not.toHaveBeenCalled();

        // 状態を戻す
        mockReadOnlyStore.canViewDashboard = true;
        mockReadOnlyStore.canViewEncode = true;
    });
});
