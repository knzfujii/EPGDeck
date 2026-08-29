import { Hono } from 'hono';
import IThumbnailApiModel from '../../../api/thumbnail/IThumbnailApiModel';
import container from '../../../ModelContainer';
import * as api from '../HonoApiUtil';

const app = new Hono();

// POST /api/thumbnails/cleanup
app.post('/cleanup', async c => {
    const thumbnailApiModel = container.get<IThumbnailApiModel>('IThumbnailApiModel');

    try {
        await thumbnailApiModel.fileCleanup();
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// POST /api/thumbnails/videos/:videoFileId
app.post('/videos/:videoFileId', async c => {
    const thumbnailApiModel = container.get<IThumbnailApiModel>('IThumbnailApiModel');
    const videoFileId = parseInt(c.req.param('videoFileId'), 10);

    try {
        await thumbnailApiModel.add(videoFileId);
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// GET /api/thumbnails/:thumbnailId
app.get('/:thumbnailId', async c => {
    const thumbnailApiModel = container.get<IThumbnailApiModel>('IThumbnailApiModel');
    const thumbnailId = parseInt(c.req.param('thumbnailId'), 10);

    try {
        const filePath = await thumbnailApiModel.getIdFilePath(thumbnailId);
        if (filePath === null) {
            return api.responseError(c, {
                code: 404,
                message: 'thumbnail is not Found',
            });
        }
        return await api.responseFile(c, filePath, 'image/jpeg', false);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// DELETE /api/thumbnails/:thumbnailId
app.delete('/:thumbnailId', async c => {
    const thumbnailApiModel = container.get<IThumbnailApiModel>('IThumbnailApiModel');
    const thumbnailId = parseInt(c.req.param('thumbnailId'), 10);

    try {
        await thumbnailApiModel.delete(thumbnailId);
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

export default app;
