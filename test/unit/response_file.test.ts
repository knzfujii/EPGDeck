import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { responseFile } from '../../src/model/service/hono/HonoApiUtil.js';

describe('HonoApiUtil - responseFile', () => {
    let tmpDir: string;
    let testFilePath: string;
    const testContent = '0123456789abcdefghijklmnopqrstuvwxyz'; // 36 bytes

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epgdeck-respfile-test-'));
        testFilePath = path.join(tmpDir, 'test.mp4');
        fs.writeFileSync(testFilePath, testContent);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const createMockContext = (options: {
        rangeHeader?: string;
        method?: string;
        signal?: AbortSignal;
        incomingCloseEmitter?: any;
    }) => {
        const headers: Record<string, string> = {};
        if (options.rangeHeader) {
            headers['range'] = options.rangeHeader;
        }

        const incomingListeners: Record<string, (() => void)[]> = {};
        const incoming = options.incomingCloseEmitter || {
            once: (event: string, fn: () => void) => {
                incomingListeners[event] = incomingListeners[event] || [];
                incomingListeners[event].push(fn);
            },
            emit: (event: string) => {
                (incomingListeners[event] || []).forEach(fn => fn());
            },
        };

        return {
            req: {
                method: options.method || 'GET',
                header: (name: string) => headers[name.toLowerCase()],
                raw: {
                    signal: options.signal,
                },
            },
            env: {
                incoming,
            },
        } as any;
    };

    it('should return 200 with full content when no range header is present', async () => {
        const c = createMockContext({});
        const res = await responseFile(c, testFilePath, 'video/mp4');

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Length')).toBe(testContent.length.toString());
        expect(res.headers.get('Content-Type')).toBe('video/mp4');
        expect(res.headers.get('Accept-Ranges')).toBe('bytes');

        const text = await res.text();
        expect(text).toBe(testContent);
    });

    it('should return 206 with partial content for valid range header', async () => {
        const c = createMockContext({ rangeHeader: 'bytes=0-9' });
        const res = await responseFile(c, testFilePath, 'video/mp4');

        expect(res.status).toBe(206);
        expect(res.headers.get('Content-Length')).toBe('10');
        expect(res.headers.get('Content-Range')).toBe(`bytes 0-9/${testContent.length}`);
        expect(res.headers.get('Accept-Ranges')).toBe('bytes');

        const text = await res.text();
        expect(text).toBe('0123456789');
    });

    it('should correctly return 1 byte with Content-Length 1 when start === end (e.g. bytes=0-0)', async () => {
        const c = createMockContext({ rangeHeader: 'bytes=0-0' });
        const res = await responseFile(c, testFilePath, 'video/mp4');

        expect(res.status).toBe(206);
        expect(res.headers.get('Content-Length')).toBe('1');
        expect(res.headers.get('Content-Range')).toBe(`bytes 0-0/${testContent.length}`);

        const text = await res.text();
        expect(text).toBe('0');
    });

    it('should return 416 for invalid or out-of-range range requests', async () => {
        const c = createMockContext({ rangeHeader: `bytes=100-200` });
        const res = await responseFile(c, testFilePath, 'video/mp4');

        expect(res.status).toBe(416);
        expect(res.headers.get('Content-Range')).toBe(`bytes */${testContent.length}`);
    });

    it('should terminate the stream when AbortController aborts (simulating client seek/disconnect)', async () => {
        const controller = new AbortController();

        const c = createMockContext({
            rangeHeader: 'bytes=0-35',
            signal: controller.signal,
        });

        const res = await responseFile(c, testFilePath, 'video/mp4');
        expect(res.status).toBe(206);

        const reader = res.body?.getReader();
        expect(reader).toBeDefined();

        // Abort the request (client disconnected / seeked)
        controller.abort();

        // After abort, the underlying stream is destroyed and reading rejects with AbortError
        await new Promise(resolve => setTimeout(resolve, 30));
        await expect(reader!.read()).rejects.toThrow();
    });

    it('should terminate the stream when incoming connection closes', async () => {
        let triggerClose: (() => void) | undefined;
        const mockIncoming = {
            once: (event: string, cb: () => void) => {
                if (event === 'close') triggerClose = cb;
            },
        };

        const c = createMockContext({
            rangeHeader: 'bytes=5-20',
            incomingCloseEmitter: mockIncoming,
        });

        const res = await responseFile(c, testFilePath, 'video/mp4');
        expect(res.status).toBe(206);

        const reader = res.body?.getReader();
        expect(reader).toBeDefined();

        // Trigger incoming connection close
        triggerClose?.();

        await new Promise(resolve => setTimeout(resolve, 30));
        await expect(reader!.read()).rejects.toThrow();
    });

    it('should use native stream.pipe on c.env.outgoing and return x-hono-already-sent header', async () => {
        let wroteHeadStatus = 0;
        let wroteHeadHeaders: Record<string, string> = {};
        const chunks: Buffer[] = [];
        let closeCallback: (() => void) | undefined;

        const mockOutgoing: any = {
            headersSent: false,
            writeHead: (status: number, headers: Record<string, string>) => {
                wroteHeadStatus = status;
                wroteHeadHeaders = headers;
                mockOutgoing.headersSent = true;
            },
            write: (chunk: any) => {
                chunks.push(Buffer.from(chunk));
                return true;
            },
            end: (chunk?: any) => {
                if (chunk) chunks.push(Buffer.from(chunk));
            },
            once: (event: string, cb: () => void) => {
                if (event === 'close') closeCallback = cb;
            },
            on: () => mockOutgoing,
            emit: () => true,
        };

        const c = createMockContext({ rangeHeader: 'bytes=0-9' });
        c.env.outgoing = mockOutgoing;

        const res = await responseFile(c, testFilePath, 'video/mp4');

        // With c.env.outgoing, RESPONSE_ALREADY_SENT is returned to tell @hono/node-server that response is sent
        expect(res.headers.get('x-hono-already-sent')).toBe('true');
        expect(wroteHeadStatus).toBe(206);
        expect(wroteHeadHeaders['Content-Range']).toBe(`bytes 0-9/${testContent.length}`);
        expect(wroteHeadHeaders['Content-Length']).toBe('10');

        // Wait for native stream.pipe to push data into mockOutgoing
        await new Promise(resolve => setTimeout(resolve, 50));
        const received = Buffer.concat(chunks).toString();
        expect(received).toBe('0123456789');
        if (closeCallback) closeCallback();
        await new Promise(resolve => setTimeout(resolve, 20));
    });

    it('should preserve response headers and not destroy native symbols in createAlreadySentResponse', async () => {
        const mockOutgoing: any = {
            headersSent: false,
            writeHead: () => {},
            write: () => true,
            end: () => {},
            once: () => {},
            on: () => mockOutgoing,
            emit: () => true,
        };

        const c = createMockContext({});
        c.env.outgoing = mockOutgoing;

        const res = await responseFile(c, testFilePath, 'video/mp4');
        expect(res).toBeDefined();
        expect(res.headers).toBeDefined();
        expect(res.headers.get('x-hono-already-sent')).toBe('true');
        expect(res.status).toBe(200);
    });
});
