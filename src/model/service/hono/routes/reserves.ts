import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import * as apid from '../../../../../api.js';
import IReserveApiModel from '../../../api/reserve/IReserveApiModel.js';
import container from '../../../ModelContainer.js';
import { NotFoundError } from '../../../error/ApiError.js';
import { getReserveListsQuerySchema, getReservesQuerySchema, reserveIdParamSchema } from '../schemas/reserves.js';

const app = new Hono();

// GET /api/reserves
app.get('/', zValidator('query', getReservesQuerySchema), async c => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');
    const query = c.req.valid('query');
    const result = await reserveApiModel.gets(query as apid.GetReserveOption);
    return c.json(result);
});

// POST /api/reserves
app.post('/', async c => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');
    const body = await c.req.json();
    const reserveId = await reserveApiModel.add(body);
    return c.json({ reserveId }, 201);
});

// GET /api/reserves/cnts
app.get('/cnts', async c => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');
    const result = await reserveApiModel.getCnts();
    return c.json(result);
});

// GET /api/reserves/lists
app.get('/lists', zValidator('query', getReserveListsQuerySchema), async c => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');
    const query = c.req.valid('query');
    const result = await reserveApiModel.getLists({
        startAt: query.startAt!,
        endAt: query.endAt!,
    });
    return c.json(result);
});

// POST /api/reserves/update
app.post('/update', async c => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');
    await reserveApiModel.updateAll();
    return c.json({ code: 200 });
});

// GET /api/reserves/:reserveId
app.get('/:reserveId', zValidator('param', reserveIdParamSchema), async c => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');
    const { reserveId } = c.req.valid('param');
    const isHalfWidth = c.req.query('isHalfWidth') !== 'false';
    const reserve = await reserveApiModel.get(reserveId, isHalfWidth);
    if (reserve === null) {
        throw new NotFoundError('reserve is not found');
    }
    return c.json(reserve);
});

// PUT /api/reserves/:reserveId
app.put('/:reserveId', zValidator('param', reserveIdParamSchema), async c => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');
    const { reserveId } = c.req.valid('param');
    const body = await c.req.json();
    await reserveApiModel.edit(reserveId, body);
    return c.json({ code: 201, message: 'ok' }, 201);
});

// DELETE /api/reserves/:reserveId
app.delete('/:reserveId', zValidator('param', reserveIdParamSchema), async c => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');
    const { reserveId } = c.req.valid('param');
    const result = await reserveApiModel.cancel(reserveId);
    return c.json(result);
});

// DELETE /api/reserves/:reserveId/skip
app.delete('/:reserveId/skip', zValidator('param', reserveIdParamSchema), async c => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');
    const { reserveId } = c.req.valid('param');
    const result = await reserveApiModel.removeSkip(reserveId);
    return c.json(result);
});

// DELETE /api/reserves/:reserveId/overlap
app.delete('/:reserveId/overlap', zValidator('param', reserveIdParamSchema), async c => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');
    const { reserveId } = c.req.valid('param');
    const result = await reserveApiModel.removeOverlap(reserveId);
    return c.json(result);
});

export default app;
