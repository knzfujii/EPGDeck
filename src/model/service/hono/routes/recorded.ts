import { Hono } from 'hono';
import { GetRecordedOption } from '../../../../../api';
import IRecordedApiModel from '../../../api/recorded/IRecordedApiModel';
import container from '../../../ModelContainer';
import * as api from '../HonoApiUtil';

const app = new Hono();

// GET /api/recorded
app.get('/', async c => {
    const recordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');
    const query = c.req.query();

    try {
        const option: GetRecordedOption = {
            isHalfWidth: query.isHalfWidth === 'true',
        };
        if (typeof query.offset !== 'undefined') {
            option.offset = parseInt(query.offset, 10);
        }
        if (typeof query.limit !== 'undefined') {
            option.limit = parseInt(query.limit, 10);
        }
        if (typeof query.isReverse !== 'undefined') {
            option.isReverse = query.isReverse === 'true';
        }
        if (typeof query.ruleId !== 'undefined') {
            option.ruleId = parseInt(query.ruleId, 10);
        }
        if (typeof query.channelId !== 'undefined') {
            option.channelId = parseInt(query.channelId, 10);
        }
        if (typeof query.genre !== 'undefined') {
            option.genre = parseInt(query.genre, 10);
        }
        if (typeof query.keyword === 'string') {
            option.keyword = query.keyword;
        }
        if (typeof query.hasOriginalFile !== 'undefined') {
            option.hasOriginalFile = query.hasOriginalFile === 'true';
        }

        const result = await recordedApiModel.gets(option);
        return api.responseJSON(c, 200, result);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// GET /api/recorded/options
app.get('/options', async c => {
    const recordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');

    try {
        const list = await recordedApiModel.getSearchOptionList();
        return api.responseJSON(c, 200, list);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// POST /api/recorded/cleanup
app.post('/cleanup', async c => {
    const recordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');

    try {
        await recordedApiModel.fileCleanup();
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// GET /api/recorded/:recordedId
app.get('/:recordedId', async c => {
    const recordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');
    const recordedId = parseInt(c.req.param('recordedId'), 10);
    const isHalfWidth = c.req.query('isHalfWidth') === 'true';

    try {
        const recorded = await recordedApiModel.get(recordedId, isHalfWidth);
        if (recorded === null) {
            return api.responseError(c, {
                code: 404,
                message: 'recorded is not Found',
            });
        }
        return api.responseJSON(c, 200, recorded);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// DELETE /api/recorded/:recordedId
app.delete('/:recordedId', async c => {
    const recordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');
    const recordedId = parseInt(c.req.param('recordedId'), 10);

    try {
        await recordedApiModel.delete(recordedId);
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// PUT /api/recorded/:recordedId/protect
app.put('/:recordedId/protect', async c => {
    const recordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');
    const recordedId = parseInt(c.req.param('recordedId'), 10);

    try {
        await recordedApiModel.changeProtect(recordedId, true);
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// PUT /api/recorded/:recordedId/unprotect
app.put('/:recordedId/unprotect', async c => {
    const recordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');
    const recordedId = parseInt(c.req.param('recordedId'), 10);

    try {
        await recordedApiModel.changeProtect(recordedId, false);
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// DELETE /api/recorded/:recordedId/encode
app.delete('/:recordedId/encode', async c => {
    const recordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');
    const recordedId = parseInt(c.req.param('recordedId'), 10);

    try {
        await recordedApiModel.stopEncode(recordedId);
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

export default app;
