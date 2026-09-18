import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import * as apid from '../../../../../api.js';
import IRuleApiModel from '../../../api/rule/IRuleApiModel.js';
import container from '../../../ModelContainer.js';
import { NotFoundError } from '../../../error/ApiError.js';
import { editRuleJsonSchema, getRulesQuerySchema, ruleIdParamSchema } from '../schemas/rules.js';

const app = new Hono()
    // GET /api/rules
    .get('/', zValidator('query', getRulesQuerySchema), async c => {
        const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
        const query = c.req.valid('query');
        const result = await ruleApiModel.gets(query as apid.GetRuleOption);
        return c.json(result);
    })
    // POST /api/rules
    .post('/', async c => {
        const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
        const body = await c.req.json();
        const ruleId = await ruleApiModel.add(body);
        return c.json({ ruleId }, 201);
    })
    // GET /api/rules/keyword
    .get('/keyword', zValidator('query', getRulesQuerySchema), async c => {
        const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
        const query = c.req.valid('query');
        const items = await ruleApiModel.searchKeyword(query as apid.GetRuleOption);
        return c.json({ items });
    })
    // GET /api/rules/:ruleId
    .get('/:ruleId', zValidator('param', ruleIdParamSchema), async c => {
        const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
        const { ruleId } = c.req.valid('param');
        const rule = await ruleApiModel.get(ruleId);
        if (rule === null) {
            throw new NotFoundError('Rule is not Found');
        }
        return c.json(rule);
    })
    // PUT /api/rules/:ruleId
    .put('/:ruleId', zValidator('param', ruleIdParamSchema), zValidator('json', editRuleJsonSchema), async c => {
        const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
        const { ruleId } = c.req.valid('param');
        const body = c.req.valid('json');
        (body as any).id = ruleId;
        await ruleApiModel.update(body as any);
        return c.json({ code: 200 });
    })
    // DELETE /api/rules/:ruleId
    .delete('/:ruleId', zValidator('param', ruleIdParamSchema), async c => {
        const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
        const { ruleId } = c.req.valid('param');
        await ruleApiModel.delete(ruleId);
        return c.json({ code: 200 });
    })
    // PUT /api/rules/:ruleId/enable
    .put('/:ruleId/enable', zValidator('param', ruleIdParamSchema), async c => {
        const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
        const { ruleId } = c.req.valid('param');
        await ruleApiModel.enable(ruleId);
        return c.json({ code: 200 });
    })
    // PUT /api/rules/:ruleId/disable
    .put('/:ruleId/disable', zValidator('param', ruleIdParamSchema), async c => {
        const ruleApiModel = container.get<IRuleApiModel>('IRuleApiModel');
        const { ruleId } = c.req.valid('param');
        await ruleApiModel.disable(ruleId);
        return c.json({ code: 200 });
    });

export default app;
