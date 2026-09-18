import * as path from 'path';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import IThumbnailApiModel from '../../../api/thumbnail/IThumbnailApiModel.js';
import container from '../../../ModelContainer.js';
import * as api from '../HonoApiUtil.js';
import { NotFoundError } from '../../../error/ApiError.js';
import { thumbnailParamSchema, videoFileParamSchema } from '../schemas/thumbnails.js';

const app = new Hono()
    // POST /api/thumbnails/cleanup
    .post('/cleanup', async c => {
        const thumbnailApiModel = container.get<IThumbnailApiModel>('IThumbnailApiModel');
        await thumbnailApiModel.fileCleanup();
        return c.json({ code: 200 });
    })
    // POST /api/thumbnails/regenerate
    .post('/regenerate', async c => {
        const thumbnailApiModel = container.get<IThumbnailApiModel>('IThumbnailApiModel');
        await thumbnailApiModel.regenerate();
        return c.json({ code: 200 });
    })
    // POST /api/thumbnails/videos/:videoFileId
    .post('/videos/:videoFileId', zValidator('param', videoFileParamSchema), async c => {
        const thumbnailApiModel = container.get<IThumbnailApiModel>('IThumbnailApiModel');
        const { videoFileId } = c.req.valid('param');
        await thumbnailApiModel.add(videoFileId);
        return c.json({ code: 200 });
    })
    // GET /api/thumbnails/:thumbnailId
    .get('/:thumbnailId', zValidator('param', thumbnailParamSchema), async c => {
        const thumbnailApiModel = container.get<IThumbnailApiModel>('IThumbnailApiModel');
        const { thumbnailId } = c.req.valid('param');

        const filePath = await thumbnailApiModel.getIdFilePath(thumbnailId);
        if (filePath === null) {
            throw new NotFoundError('thumbnail is not Found');
        }
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'image/jpeg';
        return await api.responseFile(c, filePath, mimeType, false);
    })
    // DELETE /api/thumbnails/:thumbnailId
    .delete('/:thumbnailId', zValidator('param', thumbnailParamSchema), async c => {
        const thumbnailApiModel = container.get<IThumbnailApiModel>('IThumbnailApiModel');
        const { thumbnailId } = c.req.valid('param');
        await thumbnailApiModel.delete(thumbnailId);
        return c.json({ code: 200 });
    });

export default app;
