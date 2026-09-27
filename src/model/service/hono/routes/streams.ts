import { Readable } from 'stream';
import { Context, Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import IStreamApiModel, { StreamResponse } from '../../../api/stream/IStreamApiModel.js';
import container from '../../../ModelContainer.js';
import { ApiError } from '../../../error/ApiError.js';
import * as api from '../HonoApiUtil.js';
import {
    getStreamsQuerySchema,
    liveStreamParamSchema,
    recordedStreamQuerySchema,
    streamIdParamSchema,
    streamModeQuerySchema,
    videoFileIdStreamParamSchema,
} from '../schemas/streams.js';

// Tuner resource unavailable check helper
const isTunerUnavailable = (err: any): boolean => {
    if (!err) return false;
    const msg = typeof err === 'string' ? err : err.message || String(err);
    return msg.includes('503') || msg.includes('Tuner Resource Unavailable');
};

// Helper for live/recorded media stream response with Web Streams backpressure control
const handleLiveStream = async (c: Context, startFn: () => Promise<StreamResponse>, contentType: string) => {
    const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
    let keepTimer: NodeJS.Timeout | null = null;
    let streamId: number | null = null;
    let nodeStream: Readable | null = null;
    let isCleanedUp = false;
    let isAborted = false;

    const incoming = (c.env as any)?.incoming;
    const outgoing = (c.env as any)?.outgoing;

    // Check pre-aborted / destroyed conditions BEFORE acquiring resources
    if (c.req.raw?.signal?.aborted || incoming?.destroyed || outgoing?.destroyed) {
        return api.responseError(c, { code: 400, message: 'Request Aborted' });
    }

    const cleanup = async () => {
        if (isCleanedUp) return;
        if (streamId !== null || nodeStream !== null) {
            isCleanedUp = true;
        }
        if (keepTimer) {
            clearInterval(keepTimer);
            keepTimer = null;
        }
        // Remove client disconnect listeners to prevent leaks on keep-alive sockets
        try {
            if (c.req.raw?.signal) {
                c.req.raw.signal.removeEventListener('abort', onAbort);
            }
            if (incoming) {
                incoming.removeListener('close', onAbort);
                incoming.removeListener('error', onAbort);
            }
            if (outgoing) {
                outgoing.removeListener('close', onAbort);
                outgoing.removeListener('error', onAbort);
            }
        } catch {
            // ignore
        }
        try {
            if (nodeStream && !nodeStream.destroyed) {
                nodeStream.destroy();
            }
        } catch {
            // ignore
        }
        if (streamId !== null) {
            const sId = streamId;
            streamId = null;
            await streamApiModel.stop(sId, true).catch(() => {});
        }
    };

    const onAbort = () => {
        isAborted = true;
        void cleanup();
    };

    // Attach client disconnect listeners early so disconnect during startFn is captured
    if (c.req.raw?.signal) {
        c.req.raw.signal.addEventListener('abort', onAbort, { once: true });
    }
    if (incoming) {
        incoming.once('close', onAbort);
        incoming.once('error', onAbort);
    }
    if (outgoing) {
        outgoing.once('close', onAbort);
        outgoing.once('error', onAbort);
    }

    try {
        const result = await startFn();
        streamId = result.streamId;
        nodeStream = result.stream;

        // If client aborted while startFn was resolving, immediately stop and return 400
        if (isAborted || c.req.raw?.signal?.aborted || incoming?.destroyed || outgoing?.destroyed) {
            await cleanup();
            return api.responseError(c, { code: 400, message: 'Request Aborted' });
        }

        keepTimer = setInterval(() => {
            try {
                if (streamId !== null) {
                    streamApiModel.keep(streamId);
                }
            } catch {
                void cleanup();
            }
        }, 10 * 1000);
        keepTimer.unref?.();

        nodeStream.once('end', () => void cleanup());
        nodeStream.once('close', () => void cleanup());
        nodeStream.on('error', () => void cleanup());

        const webStream = Readable.toWeb(nodeStream);

        return new Response(webStream as any, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache',
            },
        });
    } catch (err: any) {
        await cleanup();
        if (isTunerUnavailable(err)) {
            return api.responseError(c, { code: 503, message: 'Tuner Resource Unavailable', errors: err.message });
        }
        return api.responseServerError(c, err.message);
    }
};

const app = new Hono()
    // GET /api/streams
    .get('/', zValidator('query', getStreamsQuerySchema), async c => {
        const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
        const { isHalfWidth = true } = c.req.valid('query');
        const infos = await streamApiModel.getStreamInfos(isHalfWidth);
        return c.json(infos);
    })
    // DELETE /api/streams
    .delete('/', async c => {
        const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
        await streamApiModel.stopAll();
        return c.json({ code: 200 });
    })
    // DELETE /api/streams/:streamId
    .delete('/:streamId', zValidator('param', streamIdParamSchema), async c => {
        const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
        const { streamId } = c.req.valid('param');
        await streamApiModel.stop(streamId);
        return c.json({ code: 200 });
    })
    // PUT /api/streams/:streamId/keep
    .put('/:streamId/keep', zValidator('param', streamIdParamSchema), async c => {
        const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
        const { streamId } = c.req.valid('param');
        await streamApiModel.keep(streamId);
        return c.json({ code: 200 });
    })
    // GET /api/streams/live/:channelId/hls
    .get(
        '/live/:channelId/hls',
        zValidator('param', liveStreamParamSchema),
        zValidator('query', streamModeQuerySchema),
        async c => {
            const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
            const { channelId } = c.req.valid('param');
            const { mode = 0 } = c.req.valid('query');

            try {
                const streamId = await streamApiModel.startLiveHLSStream({ channelId, mode });
                return c.json({ streamId });
            } catch (err: any) {
                if (isTunerUnavailable(err)) {
                    throw new ApiError(503, 'Tuner Resource Unavailable');
                }
                throw err;
            }
        },
    )
    // GET /api/streams/live/:channelId/m2ts/playlist
    .get(
        '/live/:channelId/m2ts/playlist',
        zValidator('param', liveStreamParamSchema),
        zValidator('query', streamModeQuerySchema),
        async c => {
            const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
            const { channelId } = c.req.valid('param');
            const { mode = 0 } = c.req.valid('query');
            const host = c.req.header('host');

            try {
                if (typeof host === 'undefined') {
                    throw new Error('HostIsUndefined');
                }
                const playlist = await streamApiModel.getLiveM2TsStreamM3u8(host, api.isSecureProtocol(c), {
                    channelId,
                    mode,
                });
                if (playlist === null) {
                    return api.responseError(c, { code: 404, message: 'play list is not found' });
                }
                return api.responsePlayList(c, playlist);
            } catch (err: any) {
                if (isTunerUnavailable(err)) {
                    return api.responseError(c, {
                        code: 503,
                        message: 'Tuner Resource Unavailable',
                        errors: err.message,
                    });
                }
                return api.responseServerError(c, err.message);
            }
        },
    )
    // GET /api/streams/live/:channelId/m2ts
    .get(
        '/live/:channelId/m2ts',
        zValidator('param', liveStreamParamSchema),
        zValidator('query', streamModeQuerySchema),
        async c => {
            const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
            const { channelId } = c.req.valid('param');
            const { mode = 0 } = c.req.valid('query');
            return handleLiveStream(c, () => streamApiModel.startLiveM2TsStream({ channelId, mode }), 'video/mp2t');
        },
    )
    // GET /api/streams/live/:channelId/m2tsll
    .get(
        '/live/:channelId/m2tsll',
        zValidator('param', liveStreamParamSchema),
        zValidator('query', streamModeQuerySchema),
        async c => {
            const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
            const { channelId } = c.req.valid('param');
            const { mode = 0 } = c.req.valid('query');
            return handleLiveStream(c, () => streamApiModel.startLiveM2TsLLStream({ channelId, mode }), 'video/mp2t');
        },
    )
    // GET /api/streams/live/:channelId/mp4
    .get(
        '/live/:channelId/mp4',
        zValidator('param', liveStreamParamSchema),
        zValidator('query', streamModeQuerySchema),
        async c => {
            const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
            const { channelId } = c.req.valid('param');
            const { mode = 0 } = c.req.valid('query');
            return handleLiveStream(c, () => streamApiModel.startMp4Stream({ channelId, mode }), 'video/mp4');
        },
    )
    // GET /api/streams/live/:channelId/webm
    .get(
        '/live/:channelId/webm',
        zValidator('param', liveStreamParamSchema),
        zValidator('query', streamModeQuerySchema),
        async c => {
            const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
            const { channelId } = c.req.valid('param');
            const { mode = 0 } = c.req.valid('query');
            return handleLiveStream(c, () => streamApiModel.startLiveWebmStream({ channelId, mode }), 'video/webm');
        },
    )
    // GET /api/streams/recorded/:videoFileId/hls
    .get(
        '/recorded/:videoFileId/hls',
        zValidator('param', videoFileIdStreamParamSchema),
        zValidator('query', recordedStreamQuerySchema),
        async c => {
            const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
            const { videoFileId } = c.req.valid('param');
            const { mode = 0, ss: playPosition = 0 } = c.req.valid('query');

            const streamId = await streamApiModel.startRecordedHLSStream({ videoFileId, playPosition, mode });
            return c.json({ streamId });
        },
    )
    // GET /api/streams/recorded/:videoFileId/mp4
    .get(
        '/recorded/:videoFileId/mp4',
        zValidator('param', videoFileIdStreamParamSchema),
        zValidator('query', recordedStreamQuerySchema),
        async c => {
            const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
            const { videoFileId } = c.req.valid('param');
            const { mode = 0, ss: playPosition = 0 } = c.req.valid('query');
            return handleLiveStream(
                c,
                () => streamApiModel.startRecordedMp4Stream({ videoFileId, playPosition, mode }),
                'video/mp4',
            );
        },
    )
    // GET /api/streams/recorded/:videoFileId/webm
    .get(
        '/recorded/:videoFileId/webm',
        zValidator('param', videoFileIdStreamParamSchema),
        zValidator('query', recordedStreamQuerySchema),
        async c => {
            const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
            const { videoFileId } = c.req.valid('param');
            const { mode = 0, ss: playPosition = 0 } = c.req.valid('query');
            return handleLiveStream(
                c,
                () => streamApiModel.startRecordedWebMStream({ videoFileId, playPosition, mode }),
                'video/webm',
            );
        },
    );

export default app;
