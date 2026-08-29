import { Hono } from 'hono';
import * as apid from '../../../../../api';
import IRecordedTagApiModel from '../../../api/recordedTag/IRecordedTagApiModel';
import container from '../../../ModelContainer';
import * as api from '../HonoApiUtil';

const app = new Hono();

// GET /api/tags
app.get('/', async c => {
    const recordedTagApiModel = container.get<IRecordedTagApiModel>('IRecordedTagApiModel');
    const query = c.req.query();

    try {
        const option: apid.GetRecordedTagOption = {};
        if (typeof query.offset !== 'undefined') {
            option.offset = parseInt(query.offset, 10);
        }
        if (typeof query.limit !== 'undefined') {
            option.limit = parseInt(query.limit, 10);
        }
        if (typeof query.name === 'string') {
            option.name = query.name;
        }
        const excludeTagId = c.req.queries('excludeTagId');
        if (excludeTagId && excludeTagId.length > 0) {
            option.excludeTagId = excludeTagId.map(s => parseInt(s, 10));
        }

        const result = await recordedTagApiModel.gets(option);
        return api.responseJSON(c, 200, result);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// POST /api/tags
app.post('/', async c => {
    const recordedTagApiModel = container.get<IRecordedTagApiModel>('IRecordedTagApiModel');

    try {
        const body = await c.req.json();
        const tagId = await recordedTagApiModel.create(body.name, body.color);
        return api.responseJSON(c, 201, { tagId });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// DELETE /api/tags/:tagId
app.delete('/:tagId', async c => {
    const recordedTagApiModel = container.get<IRecordedTagApiModel>('IRecordedTagApiModel');
    const tagId = parseInt(c.req.param('tagId'), 10);

    try {
        await recordedTagApiModel.delete(tagId);
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// PUT /api/tags/:tagId
app.put('/:tagId', async c => {
    const recordedTagApiModel = container.get<IRecordedTagApiModel>('IRecordedTagApiModel');
    const tagId = parseInt(c.req.param('tagId'), 10);

    try {
        const body = await c.req.json();
        await recordedTagApiModel.update(tagId, body.name, body.color);
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// PUT /api/tags/:tagId/relate
app.put('/:tagId/relate', async c => {
    const recordedTagApiModel = container.get<IRecordedTagApiModel>('IRecordedTagApiModel');
    const tagId = parseInt(c.req.param('tagId'), 10);

    try {
        const body = await c.req.json();
        await recordedTagApiModel.setRelation(tagId, body.recordedId);
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// DELETE /api/tags/:tagId/relate
app.delete('/:tagId/relate', async c => {
    const recordedTagApiModel = container.get<IRecordedTagApiModel>('IRecordedTagApiModel');
    const tagId = parseInt(c.req.param('tagId'), 10);
    const recordedId = parseInt(c.req.query('recordedId') || '', 10);

    try {
        await recordedTagApiModel.deleteRelation(tagId, recordedId);
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

export default app;
