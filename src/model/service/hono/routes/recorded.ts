import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { GetRecordedOption } from '../../../../../api.js';
import IRecordedApiModel from '../../../api/recorded/IRecordedApiModel.js';
import container from '../../../ModelContainer.js';
import { NotFoundError } from '../../../error/ApiError.js';
import { getRecordedQuerySchema, recordedIdParamSchema } from '../schemas/recorded.js';

const app = new Hono()
    // GET /api/recorded
    .get('/', zValidator('query', getRecordedQuerySchema), async c => {
        const recordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');
        const query = c.req.valid('query');
        const result = await recordedApiModel.gets(query as GetRecordedOption);
        return c.json(result);
    })
    // GET /api/recorded/options
    .get('/options', async c => {
        const recordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');
        const list = await recordedApiModel.getSearchOptionList();
        return c.json(list);
    })
    // POST /api/recorded/cleanup
    .post('/cleanup', async c => {
        const recordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');
        await recordedApiModel.fileCleanup();
        return c.json({ code: 200 });
    })
    // GET /api/recorded/:recordedId
    .get('/:recordedId', zValidator('param', recordedIdParamSchema), async c => {
        const recordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');
        const { recordedId } = c.req.valid('param');
        const isHalfWidth = c.req.query('isHalfWidth') !== 'false';
        const recorded = await recordedApiModel.get(recordedId, isHalfWidth);
        if (recorded === null) {
            throw new NotFoundError('recorded is not Found');
        }
        return c.json(recorded);
    })
    // DELETE /api/recorded/:recordedId
    .delete('/:recordedId', zValidator('param', recordedIdParamSchema), async c => {
        const recordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');
        const { recordedId } = c.req.valid('param');
        await recordedApiModel.delete(recordedId);
        return c.json({ code: 200 });
    })
    // PUT /api/recorded/:recordedId/protect
    .put('/:recordedId/protect', zValidator('param', recordedIdParamSchema), async c => {
        const recordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');
        const { recordedId } = c.req.valid('param');
        await recordedApiModel.changeProtect(recordedId, true);
        return c.json({ code: 200 });
    })
    // PUT /api/recorded/:recordedId/unprotect
    .put('/:recordedId/unprotect', zValidator('param', recordedIdParamSchema), async c => {
        const recordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');
        const { recordedId } = c.req.valid('param');
        await recordedApiModel.changeProtect(recordedId, false);
        return c.json({ code: 200 });
    })
    // DELETE /api/recorded/:recordedId/encode
    .delete('/:recordedId/encode', zValidator('param', recordedIdParamSchema), async c => {
        const recordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');
        const { recordedId } = c.req.valid('param');
        await recordedApiModel.stopEncode(recordedId);
        return c.json({ code: 200 });
    });

export default app;
