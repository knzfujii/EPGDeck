import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import container from '../../src/model/ModelContainer.js';
import streamsApp from '../../src/model/service/hono/routes/streams.js';

describe('Streams Hono Route & Backpressure Tests', () => {
    let mockStreamApiModel: any;

    beforeEach(() => {
        mockStreamApiModel = {
            startLiveM2TsStream: vi.fn(),
            startLiveM2TsLLStream: vi.fn(),
            startLiveWebmStream: vi.fn(),
            startMp4Stream: vi.fn(),
            startLiveHLSStream: vi.fn(),
            startRecordedWebMStream: vi.fn(),
            startRecordedMp4Stream: vi.fn(),
            startRecordedHLSStream: vi.fn(),
            getLiveM2TsStreamM3u8: vi.fn(),
            stop: vi.fn().mockResolvedValue(undefined),
            stopAll: vi.fn().mockResolvedValue(undefined),
            keep: vi.fn(),
            getStreamInfos: vi.fn().mockResolvedValue({ items: [] }),
        };

        if (container.isBound('IStreamApiModel')) {
            container.rebind('IStreamApiModel').toConstantValue(mockStreamApiModel);
        } else {
            container.bind('IStreamApiModel').toConstantValue(mockStreamApiModel);
        }
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    // Helper to create a controllable Node Readable stream
    const createControlledStream = () => {
        let readCount = 0;
        const stream = new Readable({
            read() {
                readCount++;
                this.push(Buffer.from(`chunk-${readCount}`));
            },
        });
        return {
            stream,
            getReadCount: () => readCount,
        };
    };

    describe('Backpressure Control (OOM Prevention)', () => {
        it('pauses pulling data when consumer does not read chunks', async () => {
            let pullCount = 0;
            const nodeStream = new Readable({
                highWaterMark: 16,
                read() {
                    pullCount++;
                    // Push 64KB chunk
                    this.push(Buffer.alloc(64 * 1024, 0x41));
                },
            });

            mockStreamApiModel.startMp4Stream.mockResolvedValue({
                streamId: 101,
                stream: nodeStream,
            });

            const res = await streamsApp.request('/live/1/mp4');
            expect(res.status).toBe(200);
            expect(res.headers.get('Content-Type')).toBe('video/mp4');

            const reader = res.body!.getReader();

            // Read first chunk
            const firstChunk = await reader.read();
            expect(firstChunk.done).toBe(false);
            expect(firstChunk.value!.length).toBe(64 * 1024);

            // Wait a moment without reading any further chunks
            const pullsBeforeWait = pullCount;
            await new Promise(r => setTimeout(r, 60));

            // Pull count must not grow infinitely (backpressure must hold)
            expect(pullCount).toBeLessThanOrEqual(pullsBeforeWait + 2);

            // Cancel reader and verify cleanup
            await reader.cancel();
            await new Promise(r => setTimeout(r, 20));
            expect(nodeStream.destroyed).toBe(true);
            expect(mockStreamApiModel.stop).toHaveBeenCalledWith(101, true);
        });
    });

    describe('Lifecycle and Cleanup on Stream Termination', () => {
        it('cleans up streamApiModel and keep timer on normal EOF', async () => {
            const nodeStream = new Readable({
                read() {
                    this.push(Buffer.from('final chunk'));
                    this.push(null); // EOF
                },
            });

            mockStreamApiModel.startMp4Stream.mockResolvedValue({
                streamId: 202,
                stream: nodeStream,
            });

            const res = await streamsApp.request('/live/1/mp4');
            const reader = res.body!.getReader();

            const c1 = await reader.read();
            expect(c1.done).toBe(false);
            expect(Buffer.from(c1.value!).toString()).toBe('final chunk');

            const c2 = await reader.read();
            expect(c2.done).toBe(true);

            // Allow event loop to process close/end event
            await new Promise(r => setTimeout(r, 20));
            expect(mockStreamApiModel.stop).toHaveBeenCalledWith(202, true);
        });

        it('cleans up when client aborts via AbortSignal', async () => {
            const { stream: nodeStream } = createControlledStream();

            mockStreamApiModel.startMp4Stream.mockResolvedValue({
                streamId: 303,
                stream: nodeStream,
            });

            const abortController = new AbortController();
            const res = await streamsApp.request('/live/1/mp4', {
                signal: abortController.signal,
            });
            expect(res.status).toBe(200);

            const reader = res.body!.getReader();
            await reader.read();

            abortController.abort();
            await new Promise(r => setTimeout(r, 20));

            expect(nodeStream.destroyed).toBe(true);
            expect(mockStreamApiModel.stop).toHaveBeenCalledWith(303, true);
        });

        it('cleans up when consumer cancels the WebStream reader', async () => {
            const { stream: nodeStream } = createControlledStream();

            mockStreamApiModel.startMp4Stream.mockResolvedValue({
                streamId: 404,
                stream: nodeStream,
            });

            const res = await streamsApp.request('/live/1/mp4');
            const reader = res.body!.getReader();
            await reader.read();

            await reader.cancel();
            await new Promise(r => setTimeout(r, 20));

            expect(nodeStream.destroyed).toBe(true);
            expect(mockStreamApiModel.stop).toHaveBeenCalledWith(404, true);
        });

        it('handles stream error and triggers cleanup without unhandled rejection', async () => {
            let pushed = false;
            const nodeStream = new Readable({
                read() {
                    if (!pushed) {
                        pushed = true;
                        this.push(Buffer.from('hello'));
                    } else {
                        this.destroy(new Error('ffmpeg killed'));
                    }
                },
            });

            mockStreamApiModel.startMp4Stream.mockResolvedValue({
                streamId: 505,
                stream: nodeStream,
            });

            const res = await streamsApp.request('/live/1/mp4');
            const reader = res.body!.getReader();

            const c1 = await reader.read();
            expect(c1.done).toBe(false);

            await expect(reader.read()).rejects.toThrow();

            await new Promise(r => setTimeout(r, 20));
            expect(mockStreamApiModel.stop).toHaveBeenCalledWith(505, true);
        });

        it('immediately rejects if request signal was already aborted before start', async () => {
            const abortController = new AbortController();
            abortController.abort();

            const res = await streamsApp.request('/live/1/mp4', {
                signal: abortController.signal,
            });

            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.message).toBe('Request Aborted');
            expect(mockStreamApiModel.startMp4Stream).not.toHaveBeenCalled();
        });

        it('immediately rejects if incoming socket is already destroyed before start', async () => {
            const incoming = new EventEmitter() as any;
            incoming.destroyed = true;

            const req = new Request('http://localhost/live/1/mp4');
            const res = await streamsApp.fetch(req, { incoming });

            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.message).toBe('Request Aborted');
            expect(mockStreamApiModel.startMp4Stream).not.toHaveBeenCalled();
        });

        it('immediately rejects if outgoing socket is already destroyed before start', async () => {
            const outgoing = new EventEmitter() as any;
            outgoing.destroyed = true;

            const req = new Request('http://localhost/live/1/mp4');
            const res = await streamsApp.fetch(req, { outgoing });

            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.message).toBe('Request Aborted');
            expect(mockStreamApiModel.startMp4Stream).not.toHaveBeenCalled();
        });

        it('cleans up stream if abort occurs while startFn is in flight', async () => {
            const abortController = new AbortController();
            const { stream: nodeStream } = createControlledStream();

            let startFnCalled = false;
            let resolveStart!: (val: any) => void;
            const startPromise = new Promise(resolve => {
                resolveStart = resolve;
            });
            mockStreamApiModel.startMp4Stream.mockImplementation(() => {
                startFnCalled = true;
                return startPromise;
            });

            const req = new Request('http://localhost/live/1/mp4', {
                signal: abortController.signal,
            });
            const fetchPromise = streamsApp.fetch(req);

            // Wait until startMp4Stream has actually been called and is in-flight
            while (!startFnCalled) {
                await new Promise(r => setTimeout(r, 5));
            }

            // Abort while startMp4Stream is awaiting
            abortController.abort();

            // Now resolve startMp4Stream
            resolveStart({ streamId: 707, stream: nodeStream });

            const res = await fetchPromise;
            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.message).toBe('Request Aborted');

            await new Promise(r => setTimeout(r, 20));
            expect(nodeStream.destroyed).toBe(true);
            expect(mockStreamApiModel.stop).toHaveBeenCalledWith(707, true);
        });

        it('cleans up when incoming socket emits close', async () => {
            const incoming = new EventEmitter() as any;
            incoming.destroyed = false;
            const { stream: nodeStream } = createControlledStream();

            mockStreamApiModel.startMp4Stream.mockResolvedValue({
                streamId: 808,
                stream: nodeStream,
            });

            const req = new Request('http://localhost/live/1/mp4');
            const res = await streamsApp.fetch(req, { incoming });
            expect(res.status).toBe(200);

            incoming.emit('close');
            await new Promise(r => setTimeout(r, 20));

            expect(nodeStream.destroyed).toBe(true);
            expect(mockStreamApiModel.stop).toHaveBeenCalledWith(808, true);
        });

        it('cleans up when outgoing socket emits close', async () => {
            const outgoing = new EventEmitter() as any;
            outgoing.destroyed = false;
            const { stream: nodeStream } = createControlledStream();

            mockStreamApiModel.startMp4Stream.mockResolvedValue({
                streamId: 809,
                stream: nodeStream,
            });

            const req = new Request('http://localhost/live/1/mp4');
            const res = await streamsApp.fetch(req, { outgoing });
            expect(res.status).toBe(200);

            outgoing.emit('close');
            await new Promise(r => setTimeout(r, 20));

            expect(nodeStream.destroyed).toBe(true);
            expect(mockStreamApiModel.stop).toHaveBeenCalledWith(809, true);
        });

        it('cleans up when outgoing socket emits error', async () => {
            const outgoing = new EventEmitter() as any;
            outgoing.destroyed = false;
            const { stream: nodeStream } = createControlledStream();

            mockStreamApiModel.startMp4Stream.mockResolvedValue({
                streamId: 810,
                stream: nodeStream,
            });

            const req = new Request('http://localhost/live/1/mp4');
            const res = await streamsApp.fetch(req, { outgoing });
            expect(res.status).toBe(200);

            outgoing.emit('error', new Error('ECONNRESET'));
            await new Promise(r => setTimeout(r, 20));

            expect(nodeStream.destroyed).toBe(true);
            expect(mockStreamApiModel.stop).toHaveBeenCalledWith(810, true);
        });
    });

    describe('Keepalive Timer Behavior', () => {
        it('periodically keeps stream alive and stops if keep throws', async () => {
            vi.useFakeTimers();

            const { stream: nodeStream } = createControlledStream();
            mockStreamApiModel.startMp4Stream.mockResolvedValue({
                streamId: 606,
                stream: nodeStream,
            });

            const res = await streamsApp.request('/live/1/mp4');
            expect(res.status).toBe(200);

            // Advance 10s -> keep should be called once
            await vi.advanceTimersByTimeAsync(10 * 1000);
            expect(mockStreamApiModel.keep).toHaveBeenCalledWith(606);

            // Make keep throw error
            mockStreamApiModel.keep.mockImplementation(() => {
                throw new Error('StreamNotFound');
            });

            // Advance another 10s -> keep fails, cleanup must trigger
            await vi.advanceTimersByTimeAsync(10 * 1000);

            expect(nodeStream.destroyed).toBe(true);
            expect(mockStreamApiModel.stop).toHaveBeenCalledWith(606, true);
        });
    });

    describe('Error Handling on Start', () => {
        it('returns 503 Tuner Resource Unavailable when tuner is busy', async () => {
            mockStreamApiModel.startMp4Stream.mockRejectedValue(new Error('Tuner Resource Unavailable'));

            const res = await streamsApp.request('/live/1/mp4');
            expect(res.status).toBe(503);
            const data = await res.json();
            expect(data.message).toBe('Tuner Resource Unavailable');
        });

        it('returns 500 when unexpected error occurs on start', async () => {
            mockStreamApiModel.startMp4Stream.mockRejectedValue(new Error('SpawnError: ffmpeg not found'));

            const res = await streamsApp.request('/live/1/mp4');
            expect(res.status).toBe(500);
            const data = await res.json();
            expect(data.message).toBe('Internal Server Error');
        });
    });

    describe('Supported Media Formats and Content-Types', () => {
        it('GET /live/:channelId/m2ts returns video/mp2t', async () => {
            const { stream: nodeStream } = createControlledStream();
            mockStreamApiModel.startLiveM2TsStream.mockResolvedValue({ streamId: 1, stream: nodeStream });

            const res = await streamsApp.request('/live/1/m2ts?mode=0');
            expect(res.status).toBe(200);
            expect(res.headers.get('Content-Type')).toBe('video/mp2t');
            await res.body!.cancel();
        });

        it('GET /live/:channelId/m2tsll returns video/mp2t', async () => {
            const { stream: nodeStream } = createControlledStream();
            mockStreamApiModel.startLiveM2TsLLStream.mockResolvedValue({ streamId: 2, stream: nodeStream });

            const res = await streamsApp.request('/live/1/m2tsll?mode=0');
            expect(res.status).toBe(200);
            expect(res.headers.get('Content-Type')).toBe('video/mp2t');
            await res.body!.cancel();
        });

        it('GET /live/:channelId/webm returns video/webm', async () => {
            const { stream: nodeStream } = createControlledStream();
            mockStreamApiModel.startLiveWebmStream.mockResolvedValue({ streamId: 3, stream: nodeStream });

            const res = await streamsApp.request('/live/1/webm?mode=0');
            expect(res.status).toBe(200);
            expect(res.headers.get('Content-Type')).toBe('video/webm');
            await res.body!.cancel();
        });

        it('GET /recorded/:videoFileId/mp4 returns video/mp4', async () => {
            const { stream: nodeStream } = createControlledStream();
            mockStreamApiModel.startRecordedMp4Stream.mockResolvedValue({ streamId: 4, stream: nodeStream });

            const res = await streamsApp.request('/recorded/10/mp4?mode=0&ss=30');
            expect(res.status).toBe(200);
            expect(res.headers.get('Content-Type')).toBe('video/mp4');
            expect(mockStreamApiModel.startRecordedMp4Stream).toHaveBeenCalledWith({
                videoFileId: 10,
                mode: 0,
                playPosition: 30,
            });
            await res.body!.cancel();
        });

        it('GET /recorded/:videoFileId/webm returns video/webm', async () => {
            const { stream: nodeStream } = createControlledStream();
            mockStreamApiModel.startRecordedWebMStream.mockResolvedValue({ streamId: 5, stream: nodeStream });

            const res = await streamsApp.request('/recorded/20/webm?mode=1&ss=60');
            expect(res.status).toBe(200);
            expect(res.headers.get('Content-Type')).toBe('video/webm');
            expect(mockStreamApiModel.startRecordedWebMStream).toHaveBeenCalledWith({
                videoFileId: 20,
                mode: 1,
                playPosition: 60,
            });
            await res.body!.cancel();
        });
    });

    describe('Stream Management Endpoints', () => {
        it('GET / returns stream infos', async () => {
            mockStreamApiModel.getStreamInfos.mockResolvedValue({
                items: [{ streamId: 1, type: 'LiveStream' }],
            });

            const res = await streamsApp.request('/?isHalfWidth=true');
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.items).toHaveLength(1);
        });

        it('DELETE / stops all streams', async () => {
            const res = await streamsApp.request('/', { method: 'DELETE' });
            expect(res.status).toBe(200);
            expect(mockStreamApiModel.stopAll).toHaveBeenCalledTimes(1);
        });

        it('DELETE /:streamId stops specific stream', async () => {
            const res = await streamsApp.request('/42', { method: 'DELETE' });
            expect(res.status).toBe(200);
            expect(mockStreamApiModel.stop).toHaveBeenCalledWith(42);
        });

        it('PUT /:streamId/keep keeps specific stream alive', async () => {
            const res = await streamsApp.request('/42/keep', { method: 'PUT' });
            expect(res.status).toBe(200);
            expect(mockStreamApiModel.keep).toHaveBeenCalledWith(42);
        });

        it('GET /live/:channelId/hls starts live HLS stream', async () => {
            mockStreamApiModel.startLiveHLSStream.mockResolvedValue(99);

            const res = await streamsApp.request('/live/1/hls?mode=0');
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.streamId).toBe(99);
        });

        it('GET /recorded/:videoFileId/hls starts recorded HLS stream', async () => {
            mockStreamApiModel.startRecordedHLSStream.mockResolvedValue(88);

            const res = await streamsApp.request('/recorded/5/hls?mode=0&ss=10');
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.streamId).toBe(88);
        });

        it('GET /live/:channelId/m2ts/playlist returns m3u8 playlist', async () => {
            mockStreamApiModel.getLiveM2TsStreamM3u8.mockResolvedValue({
                name: 'playlist.m3u8',
                playList: '#EXTM3U\n#EXTINF:0\nhttp://localhost/stream.ts',
            });

            const res = await streamsApp.request('/live/1/m2ts/playlist?mode=0', {
                headers: { host: 'localhost:8888' },
            });
            expect(res.status).toBe(200);
            expect(res.headers.get('Content-Type')).toContain('application/x-mpegURL');
            const text = await res.text();
            expect(text).toContain('#EXTM3U');
        });
    });
});
