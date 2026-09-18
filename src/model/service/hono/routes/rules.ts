import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import * as apid from '../../../../../api.js';
import IRuleApiModel from '../../../api/rule/IRuleApiModel.js';
import container from '../../../ModelContainer.js';
import { NotFoundError } from '../../../error/ApiError.js';
import { getRulesQuerySchema, ruleIdParamSchema } from '../schemas/rules.js';

const app = new Hono();

// GET /api/rules
app.get('/', zValidator('query', getRulesQuerySchema), async c => {
    const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
    const query = c.req.valid('query');
    const result = await ruleApiModel.gets(query as apid.GetRuleOption);
    return c.json(result);
});

// POST /api/rules
app.post('/', async c => {
    const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
    const body = await c.req.json();
    const ruleId = await ruleApiModel.add(body);
    return c.json({ ruleId }, 201);
});

// GET /api/rules/keyword
app.get('/keyword', zValidator('query', getRulesQuerySchema), async c => {
    const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
    const query = c.req.valid('query');
    const items = await ruleApiModel.searchKeyword(query as apid.GetRuleOption);
    return c.json({ items });
});

// GET /api/rules/:ruleId
app.get('/:ruleId', zValidator('param', ruleIdParamSchema), async c => {
    const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
    const { ruleId } = c.req.valid('param');
    const rule = await ruleApiModel.get(ruleId);
    if (rule === null) {
        throw new NotFoundError('Rule is not Found');
    }
    return c.json(rule);
});

// PUT /api/rules/:ruleId
app.put('/:ruleId', zValidator('param', ruleIdParamSchema), async c => {
    const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
    const { ruleId } = c.req.valid('param');
    const body = await c.req.json();
    body.id = ruleId;
    await ruleApiModel.update(body);
    return c.json({ code: 200 });
});

// DELETE /api/rules/:ruleId
app.delete('/:ruleId', zValidator('param', ruleIdParamSchema), async c => {
    const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
    const { ruleId } = c.req.valid('param');
    await ruleApiModel.delete(ruleId);
    return c.json({ code: 200 });
});

// PUT /api/rules/:ruleId/enable
app.put('/:ruleId/enable', zValidator('param', ruleIdParamSchema), async c => {
    const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
    const { ruleId } = c.req.valid('param');
    await ruleApiModel.enable(ruleId);
    return c.json({ code: 200 });
});

// PUT /api/rules/:ruleId/disable
app.put('/:ruleId/disable', zValidator('param', ruleIdParamSchema), async c => {
    const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
    const { ruleId } = c.req.valid('param');
    await ruleApiModel.disable(ruleId);
    return c.json({ code: 200 });
});

export default app;
