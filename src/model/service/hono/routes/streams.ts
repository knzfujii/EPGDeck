import { Hono } from 'hono';
import { Readable } from 'stream';
import IStreamApiModel from '../../../api/stream/IStreamApiModel';
import container from '../../../ModelContainer';
import * as api from '../HonoApiUtil';

const app = new Hono();

// GET /api/streams
app.get('/', async c => {
    const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
    const isHalfWidth = c.req.query('isHalfWidth') === 'true';

    try {
        const infos = await streamApiModel.getStreamInfos(isHalfWidth);
        return api.responseJSON(c, 200, infos);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// DELETE /api/streams
app.delete('/', async c => {
    const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');

    try {
        await streamApiModel.stopAll();
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// DELETE /api/streams/:streamId
app.delete('/:streamId', async c => {
    const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
    const streamId = parseInt(c.req.param('streamId'), 10);

    try {
        await streamApiModel.stop(streamId);
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// PUT /api/streams/:streamId/keep
app.put('/:streamId/keep', async c => {
    const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
    const streamId = parseInt(c.req.param('streamId'), 10);

    try {
        await streamApiModel.keep(streamId);
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// GET /api/streams/live/:channelId/hls
app.get('/live/:channelId/hls', async c => {
    const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
    const channelId = parseInt(c.req.param('channelId'), 10);
    const mode = parseInt(c.req.query('mode') || '0', 10);

    try {
        const streamId = await streamApiModel.startLiveHLSStream({ channelId, mode });
        return api.responseJSON(c, 200, { streamId });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// GET /api/streams/live/:channelId/m2ts/playlist
app.get('/live/:channelId/m2ts/playlist', async c => {
    const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
    const channelId = parseInt(c.req.param('channelId'), 10);
    const mode = parseInt(c.req.query('mode') || '0', 10);
    const host = c.req.header('host');

    try {
        if (typeof host === 'undefined') {
            throw new Error('HostIsUndefined');
        }
        const playlist = await streamApiModel.getLiveM2TsStreamM3u8(host, api.isSecureProtocol(c), { channelId, mode });
        if (playlist === null) {
            return api.responseError(c, { code: 404, message: 'play list is not found' });
        }
        return api.responsePlayList(c, playlist);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// Helper for live stream response
const handleLiveStream = async (c: any, startFn: () => Promise<any>, contentType: string) => {
    const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
    let keepTimer: NodeJS.Timeout | null = null;
    let streamId: number | null = null;

    try {
        const result = await startFn();
        streamId = result.streamId;

        keepTimer = setInterval(() => {
            if (streamId !== null) streamApiModel.keep(streamId);
        }, 10 * 1000);

        const nodeStream = result.stream;
        const webStream = Readable.toWeb(nodeStream);

        c.req.raw.signal?.addEventListener('abort', async () => {
            if (keepTimer) clearInterval(keepTimer);
            if (streamId !== null) await streamApiModel.stop(streamId, true);
        });

        return new Response(webStream as any, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache',
            },
        });
    } catch (err: any) {
        if (keepTimer) clearInterval(keepTimer);
        if (streamId !== null) await streamApiModel.stop(streamId, true);
        return api.responseServerError(c, err.message);
    }
};

// GET /api/streams/live/:channelId/m2ts
app.get('/live/:channelId/m2ts', async c => {
    const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
    const channelId = parseInt(c.req.param('channelId'), 10);
    const mode = parseInt(c.req.query('mode') || '0', 10);
    return handleLiveStream(c, () => streamApiModel.startLiveM2TsStream({ channelId, mode }), 'video/mp2t');
});

// GET /api/streams/live/:channelId/m2tsll
app.get('/live/:channelId/m2tsll', async c => {
    const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
    const channelId = parseInt(c.req.param('channelId'), 10);
    const mode = parseInt(c.req.query('mode') || '0', 10);
    return handleLiveStream(c, () => streamApiModel.startLiveM2TsLLStream({ channelId, mode }), 'video/mp2t');
});

// GET /api/streams/live/:channelId/mp4
app.get('/live/:channelId/mp4', async c => {
    const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
    const channelId = parseInt(c.req.param('channelId'), 10);
    const mode = parseInt(c.req.query('mode') || '0', 10);
    return handleLiveStream(c, () => streamApiModel.startMp4Stream({ channelId, mode }), 'video/mp4');
});

// GET /api/streams/live/:channelId/webm
app.get('/live/:channelId/webm', async c => {
    const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
    const channelId = parseInt(c.req.param('channelId'), 10);
    const mode = parseInt(c.req.query('mode') || '0', 10);
    return handleLiveStream(c, () => streamApiModel.startLiveWebmStream({ channelId, mode }), 'video/webm');
});

// GET /api/streams/recorded/:videoFileId/hls
app.get('/recorded/:videoFileId/hls', async c => {
    const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
    const videoFileId = parseInt(c.req.param('videoFileId'), 10);
    const playPosition = parseInt(c.req.query('ss') || '0', 10);
    const mode = parseInt(c.req.query('mode') || '0', 10);

    try {
        const streamId = await streamApiModel.startRecordedHLSStream({ videoFileId, playPosition, mode });
        return api.responseJSON(c, 200, { streamId });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// GET /api/streams/recorded/:videoFileId/mp4
app.get('/recorded/:videoFileId/mp4', async c => {
    const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
    const videoFileId = parseInt(c.req.param('videoFileId'), 10);
    const playPosition = parseInt(c.req.query('ss') || '0', 10);
    const mode = parseInt(c.req.query('mode') || '0', 10);
    return handleLiveStream(
        c,
        () => streamApiModel.startRecordedMp4Stream({ videoFileId, playPosition, mode }),
        'video/mp4',
    );
});

// GET /api/streams/recorded/:videoFileId/webm
app.get('/recorded/:videoFileId/webm', async c => {
    const streamApiModel = container.get<IStreamApiModel>('IStreamApiModel');
    const videoFileId = parseInt(c.req.param('videoFileId'), 10);
    const playPosition = parseInt(c.req.query('ss') || '0', 10);
    const mode = parseInt(c.req.query('mode') || '0', 10);
    return handleLiveStream(
        c,
        () => streamApiModel.startRecordedWebMStream({ videoFileId, playPosition, mode }),
        'video/webm',
    );
});

export default app;
