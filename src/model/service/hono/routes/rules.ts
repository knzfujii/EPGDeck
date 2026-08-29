import { Hono } from 'hono';
import * as apid from '../../../../../api';
import IRuleApiModel from '../../../api/rule/IRuleApiModel';
import container from '../../../ModelContainer';
import * as api from '../HonoApiUtil';

const app = new Hono();

// GET /api/rules
app.get('/', async c => {
    const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
    const query = c.req.query();

    try {
        const option: apid.GetRuleOption = {};
        if (typeof query.offset !== 'undefined') {
            option.offset = parseInt(query.offset, 10);
        }
        if (typeof query.limit !== 'undefined') {
            option.limit = parseInt(query.limit, 10);
        }
        if (typeof query.type !== 'undefined') {
            option.type = query.type as any;
        }
        if (typeof query.keyword === 'string') {
            option.keyword = query.keyword;
        }

        const result = await ruleApiModel.gets(option);
        return api.responseJSON(c, 200, result);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// POST /api/rules
app.post('/', async c => {
    const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');

    try {
        const body = await c.req.json();
        const ruleId = await ruleApiModel.add(body);
        return api.responseJSON(c, 201, { ruleId });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// GET /api/rules/keyword
app.get('/keyword', async c => {
    const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
    const query = c.req.query();

    try {
        const option: apid.GetRuleOption = {};
        if (typeof query.offset !== 'undefined') {
            option.offset = parseInt(query.offset, 10);
        }
        if (typeof query.limit !== 'undefined') {
            option.limit = parseInt(query.limit, 10);
        }
        if (typeof query.keyword === 'string') {
            option.keyword = query.keyword;
        }

        const items = await ruleApiModel.searchKeyword(option);
        return api.responseJSON(c, 200, { items });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// GET /api/rules/:ruleId
app.get('/:ruleId', async c => {
    const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
    const ruleId = parseInt(c.req.param('ruleId'), 10);

    try {
        const rule = await ruleApiModel.get(ruleId);
        if (rule !== null) {
            return api.responseJSON(c, 200, rule);
        } else {
            return api.responseError(c, {
                code: 404,
                message: 'Rule is not Found',
            });
        }
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// PUT /api/rules/:ruleId
app.put('/:ruleId', async c => {
    const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
    const ruleId = parseInt(c.req.param('ruleId'), 10);

    try {
        const body = await c.req.json();
        body.id = ruleId;
        await ruleApiModel.update(body);
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// DELETE /api/rules/:ruleId
app.delete('/:ruleId', async c => {
    const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
    const ruleId = parseInt(c.req.param('ruleId'), 10);

    try {
        await ruleApiModel.delete(ruleId);
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// PUT /api/rules/:ruleId/enable
app.put('/:ruleId/enable', async c => {
    const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
    const ruleId = parseInt(c.req.param('ruleId'), 10);

    try {
        await ruleApiModel.enable(ruleId);
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// PUT /api/rules/:ruleId/disable
app.put('/:ruleId/disable', async c => {
    const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
    const ruleId = parseInt(c.req.param('ruleId'), 10);

    try {
        await ruleApiModel.disable(ruleId);
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

export default app;
