import { Hono } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import * as apid from '../../../../../api';
import IConfiguration from '../../../IConfiguration';
import IRecordedApiModel from '../../../api/recorded/IRecordedApiModel';
import IVideoApiModel from '../../../api/video/IVideoApiModel';
import container from '../../../ModelContainer';
import { UploadedVideoFileOption } from '../../../operator/recorded/IRecordedManageModel';
import * as api from '../HonoApiUtil';

const app = new Hono();

// POST /api/videos/upload
app.post('/upload', async c => {
    const recordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');
    const configuration = container.get<IConfiguration>('IConfiguration');
    const config = configuration.getConfig();

    try {
        const body = await c.req.parseBody();
        const file = body['file'];

        if (!file || !(file instanceof File)) {
            throw new Error('FileIsNotFound');
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
        return api.responseJSON(c, 200, { code: 200, result: 'ok' });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// GET /api/videos/:videoFileId
app.get('/:videoFileId', async c => {
    const videoFileApiModel = container.get<IVideoApiModel>('IVideoApiModel');
    const videoFileId = parseInt(c.req.param('videoFileId'), 10);
    const isDownload = c.req.query('isDownload') === 'true';

    try {
        const fileInfo = await videoFileApiModel.getFullFilePath(videoFileId);
        if (fileInfo === null) {
            return api.responseError(c, {
                code: 404,
                message: 'video file is not found',
            });
        }
        return await api.responseFile(c, fileInfo.path, fileInfo.mime, isDownload);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// DELETE /api/videos/:videoFileId
app.delete('/:videoFileId', async c => {
    const videoFileApiModel = container.get<IVideoApiModel>('IVideoApiModel');
    const videoFileId = parseInt(c.req.param('videoFileId'), 10);

    try {
        await videoFileApiModel.deleteVideoFile(videoFileId);
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// GET /api/videos/:videoFileId/duration
app.get('/:videoFileId/duration', async c => {
    const videoFileApiModel = container.get<IVideoApiModel>('IVideoApiModel');
    const videoFileId = parseInt(c.req.param('videoFileId'), 10);

    try {
        const duration = await videoFileApiModel.getDuration(videoFileId);
        return api.responseJSON(c, 200, { duration });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// GET /api/videos/:videoFileId/playlist
app.get('/:videoFileId/playlist', async c => {
    const videoFileApiModel = container.get<IVideoApiModel>('IVideoApiModel');
    const videoFileId = parseInt(c.req.param('videoFileId'), 10);
    const host = c.req.header('host');

    try {
        if (typeof host === 'undefined') {
            throw new Error('HostIsUndefined');
        }

        const playlist = await videoFileApiModel.getM3u8(host, api.isSecureProtocol(c), videoFileId);
        if (playlist === null) {
            return api.responseError(c, {
                code: 404,
                message: 'play list is not found',
            });
        }
        return api.responsePlayList(c, playlist);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// POST /api/videos/:videoFileId/kodi
app.post('/:videoFileId/kodi', async c => {
    const videoApiModel = container.get<IVideoApiModel>('IVideoApiModel');
    const videoFileId = parseInt(c.req.param('videoFileId'), 10);
    const host = c.req.header('host');

    try {
        if (typeof host === 'undefined') {
            throw new Error('HostIsUndefined');
        }

        const body = await c.req.json();
        await videoApiModel.sendToKodi(host, api.isSecureProtocol(c), body.kodiName, videoFileId);
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

export default app;
