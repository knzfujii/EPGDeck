import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import * as apid from '../../../../../api.js';
import IRecordedTagApiModel from '../../../api/recordedTag/IRecordedTagApiModel.js';
import container from '../../../ModelContainer.js';
import { getTagsQuerySchema, tagIdParamSchema } from '../schemas/tags.js';

const app = new Hono();

// GET /api/tags
app.get('/', zValidator('query', getTagsQuerySchema), async c => {
    const recordedTagApiModel = container.get<IRecordedTagApiModel>('IRecordedTagApiModel');
    const query = c.req.valid('query');
    const option: apid.GetRecordedTagOption = {
        offset: query.offset,
        limit: query.limit,
        name: query.name,
    };
    const excludeTagId = c.req.queries('excludeTagId');
    if (excludeTagId && excludeTagId.length > 0) {
        option.excludeTagId = excludeTagId.map(s => parseInt(s, 10));
    }

    const result = await recordedTagApiModel.gets(option);
    return c.json(result);
});

// POST /api/tags
app.post('/', async c => {
    const recordedTagApiModel = container.get<IRecordedTagApiModel>('IRecordedTagApiModel');
    const body = await c.req.json();
    const tagId = await recordedTagApiModel.create(body.name, body.color);
    return c.json({ tagId }, 201);
});

// DELETE /api/tags/:tagId
app.delete('/:tagId', zValidator('param', tagIdParamSchema), async c => {
    const recordedTagApiModel = container.get<IRecordedTagApiModel>('IRecordedTagApiModel');
    const { tagId } = c.req.valid('param');
    await recordedTagApiModel.delete(tagId);
    return c.json({ code: 200 });
});

// PUT /api/tags/:tagId
app.put('/:tagId', zValidator('param', tagIdParamSchema), async c => {
    const recordedTagApiModel = container.get<IRecordedTagApiModel>('IRecordedTagApiModel');
    const { tagId } = c.req.valid('param');
    const body = await c.req.json();
    await recordedTagApiModel.update(tagId, body.name, body.color);
    return c.json({ code: 200 });
});

// PUT /api/tags/:tagId/relate
app.put('/:tagId/relate', zValidator('param', tagIdParamSchema), async c => {
    const recordedTagApiModel = container.get<IRecordedTagApiModel>('IRecordedTagApiModel');
    const { tagId } = c.req.valid('param');
    const body = await c.req.json();
    await recordedTagApiModel.setRelation(tagId, body.recordedId);
    return c.json({ code: 200 });
});

// DELETE /api/tags/:tagId/relate
app.delete('/:tagId/relate', zValidator('param', tagIdParamSchema), async c => {
    const recordedTagApiModel = container.get<IRecordedTagApiModel>('IRecordedTagApiModel');
    const { tagId } = c.req.valid('param');
    const recordedId = parseInt(c.req.query('recordedId') || '', 10);
    await recordedTagApiModel.deleteRelation(tagId, recordedId);
    return c.json({ code: 200 });
});

export default app;
