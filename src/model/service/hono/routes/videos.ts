import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as apid from '../../../../../api.js';
import container from '../../../ModelContainer.js';
import { UploadedVideoFileOption } from '../../../operator/recorded/IRecordedManageModel.js';
import * as api from '../HonoApiUtil.js';
import { BadRequestError, NotFoundError } from '../../../error/ApiError.js';
import { kodiJsonSchema, videoGetQuerySchema, videoParamSchema } from '../schemas/videos.js';

// Helper to safely get system logger
const getSystemLog = () => {
    try {
        if (container.isBound('ILoggerModel')) {
            return container.loggerModel.getLogger().system;
        }
    } catch {
        // ignore
    }
    return null;
};

const app = new Hono()
    // POST /api/videos/upload
    .post('/upload', async c => {
        const recordedApiModel = container.recordedApiModel;
        const configuration = container.configuration;
        const config = configuration.getConfig();

        const body = await c.req.parseBody();
        const file = body['file'];

        if (!file || !(file instanceof File)) {
            throw new BadRequestError('File is not found', 'FileIsNotFound');
        }

        const tempDir = config.recording.uploadTempDir;
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const tempFileName = `file-${Date.now().toString(16)}${Math.floor(100000 * Math.random()).toString(16)}`;
        const tempFilePath = path.join(tempDir, tempFileName);

        const fileStream = Readable.fromWeb(file.stream() as any);
        await pipeline(fileStream, fs.createWriteStream(tempFilePath));

        const option: UploadedVideoFileOption = {
            recordedId: parseInt(body['recordedId'] as string, 10),
            parentDirectoryName: body['parentDirectoryName'] as string,
            viewName: body['viewName'] as string,
            fileType: body['fileType'] as apid.VideoFileType,
            fileName: file.name,
            filePath: tempFilePath,
        };
        if (typeof body['subDirectory'] === 'string') {
            option.subDirectory = body['subDirectory'];
        }

        await recordedApiModel.addUploadedVideoFile(option);
        getSystemLog()?.info(`video uploaded: ${option.fileName} -> recordedId: ${option.recordedId}`);
        return c.json({ code: 200, result: 'ok' });
    })
    // GET /api/videos/:videoFileId
    .get('/:videoFileId', zValidator('param', videoParamSchema), zValidator('query', videoGetQuerySchema), async c => {
        const videoFileApiModel = container.videoApiModel;
        const { videoFileId } = c.req.valid('param');
        const { isDownload } = c.req.valid('query');

        const fileInfo = await videoFileApiModel.getFullFilePath(videoFileId);
        if (fileInfo === null) {
            throw new NotFoundError('video file is not found');
        }

        const range = c.req.header('range');
        if (!range || range.startsWith('bytes=0-') || isDownload) {
            const action = isDownload ? 'download' : 'playback';
            getSystemLog()?.info(`video ${action} requested: videoFileId: ${videoFileId} (${fileInfo.path})`);
        }

        return await api.responseFile(c, fileInfo.path, fileInfo.mime, isDownload);
    })
    // DELETE /api/videos/:videoFileId
    .delete('/:videoFileId', zValidator('param', videoParamSchema), async c => {
        const videoFileApiModel = container.videoApiModel;
        const { videoFileId } = c.req.valid('param');
        await videoFileApiModel.deleteVideoFile(videoFileId);
        return c.json({ code: 200 });
    })
    // GET /api/videos/:videoFileId/duration
    .get('/:videoFileId/duration', zValidator('param', videoParamSchema), async c => {
        const videoFileApiModel = container.videoApiModel;
        const { videoFileId } = c.req.valid('param');
        const duration = await videoFileApiModel.getDuration(videoFileId);
        return c.json({ duration });
    })
    // GET /api/videos/:videoFileId/playlist
    .get('/:videoFileId/playlist', zValidator('param', videoParamSchema), async c => {
        const videoFileApiModel = container.videoApiModel;
        const { videoFileId } = c.req.valid('param');
        const host = c.req.header('host');
        if (typeof host === 'undefined') {
            throw new BadRequestError('Host header is undefined', 'HostIsUndefined');
        }

        const playlist = await videoFileApiModel.getM3u8(host, api.isSecureProtocol(c), videoFileId);
        if (playlist === null) {
            throw new NotFoundError('play list is not found');
        }
        return api.responsePlayList(c, playlist);
    })
    // POST /api/videos/:videoFileId/kodi
    .post('/:videoFileId/kodi', zValidator('param', videoParamSchema), zValidator('json', kodiJsonSchema), async c => {
        const videoApiModel = container.videoApiModel;
        const { videoFileId } = c.req.valid('param');
        const host = c.req.header('host');
        if (typeof host === 'undefined') {
            throw new BadRequestError('Host header is undefined', 'HostIsUndefined');
        }

        const { kodiName } = c.req.valid('json');
        await videoApiModel.sendToKodi(host, api.isSecureProtocol(c), kodiName, videoFileId);
        getSystemLog()?.info(`send video to Kodi: ${kodiName} (videoFileId: ${videoFileId})`);
        return c.json({ code: 200 });
    })
    // GET /api/videos/:videoFileId/vtt
    .get('/:videoFileId/vtt', zValidator('param', videoParamSchema), async c => {
        const videoFileApiModel = container.videoApiModel;
        const { videoFileId } = c.req.valid('param');
        const vtt = await videoFileApiModel.getVtt(videoFileId);
        if (vtt === null) {
            throw new NotFoundError('video file is not found');
        }
        c.header('Content-Type', 'text/vtt; charset=utf-8');
        return c.body(vtt);
    });

export default app;
