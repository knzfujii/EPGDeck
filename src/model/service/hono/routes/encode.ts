import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import IEncodeApiModel from '../../../api/encode/IEncodeApiModel.js';
import container from '../../../ModelContainer.js';
import { createEncodeJsonSchema, encodeIdParamSchema, getEncodeQuerySchema } from '../schemas/encode.js';

const app = new Hono()
    // GET /api/encode
    .get('/', zValidator('query', getEncodeQuerySchema), async c => {
        const encodeApiModel = container.get<IEncodeApiModel>('IEncodeApiModel');
        const { isHalfWidth } = c.req.valid('query');
        const result = await encodeApiModel.getAll(isHalfWidth);
        return c.json(result);
    })
    // POST /api/encode
    .post('/', zValidator('json', createEncodeJsonSchema), async c => {
        const encodeApiModel = container.get<IEncodeApiModel>('IEncodeApiModel');
        const body = c.req.valid('json');
        const encodeId = await encodeApiModel.add(body as any);
        return c.json({ encodeId }, 201);
    })
    // DELETE /api/encode/:encodeId
    .delete('/:encodeId', zValidator('param', encodeIdParamSchema), async c => {
        const encodeApiModel = container.get<IEncodeApiModel>('IEncodeApiModel');
        const { encodeId } = c.req.valid('param');
        await encodeApiModel.cancel(encodeId);
        return c.json({ code: 200 });
    });

export default app;
