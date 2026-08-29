import { Hono } from 'hono';
import * as apid from '../../../../../api';
import IReserveApiModel from '../../../api/reserve/IReserveApiModel';
import container from '../../../ModelContainer';
import * as api from '../HonoApiUtil';

const app = new Hono();

// GET /api/reserves
app.get('/', async c => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');
    const query = c.req.query();

    try {
        const option: apid.GetReserveOption = {
            isHalfWidth: query.isHalfWidth === 'true',
        };
        if (typeof query.type !== 'undefined') {
            option.type = query.type as any;
        }
        if (typeof query.ruleId !== 'undefined') {
            option.ruleId = parseInt(query.ruleId, 10);
        }
        if (typeof query.offset !== 'undefined') {
            option.offset = parseInt(query.offset, 10);
        }
        if (typeof query.limit !== 'undefined') {
            option.limit = parseInt(query.limit, 10);
        }

        const result = await reserveApiModel.gets(option);
        return api.responseJSON(c, 200, result);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// POST /api/reserves
app.post('/', async c => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');

    try {
        const body = await c.req.json();
        const reserveId = await reserveApiModel.add(body);
        return api.responseJSON(c, 201, { reserveId });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// GET /api/reserves/cnts
app.get('/cnts', async c => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');

    try {
        const result = await reserveApiModel.getCnts();
        return api.responseJSON(c, 200, result);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// GET /api/reserves/lists
app.get('/lists', async c => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');
    const query = c.req.query();

    try {
        const result = await reserveApiModel.getLists({
            startAt: parseInt(query.startAt, 10),
            endAt: parseInt(query.endAt, 10),
        });
        return api.responseJSON(c, 200, result);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// POST /api/reserves/update
app.post('/update', async c => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');

    try {
        await reserveApiModel.updateAll();
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// GET /api/reserves/:reserveId
app.get('/:reserveId', async c => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');
    const reserveId = parseInt(c.req.param('reserveId'), 10);
    const isHalfWidth = c.req.query('isHalfWidth') === 'true';

    try {
        const reserve = await reserveApiModel.get(reserveId, isHalfWidth);
        if (reserve === null) {
            return api.responseError(c, {
                code: 404,
                message: 'reserve is not found',
            });
        }
        return api.responseJSON(c, 200, reserve);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// PUT /api/reserves/:reserveId
app.put('/:reserveId', async c => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');
    const reserveId = parseInt(c.req.param('reserveId'), 10);

    try {
        const body = await c.req.json();
        await reserveApiModel.edit(reserveId, body);
        return api.responseJSON(c, 201, {
            code: 201,
            message: 'ok',
        });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// DELETE /api/reserves/:reserveId
app.delete('/:reserveId', async c => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');
    const reserveId = parseInt(c.req.param('reserveId'), 10);

    try {
        const result = await reserveApiModel.cancel(reserveId);
        return api.responseJSON(c, 200, result);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// DELETE /api/reserves/:reserveId/skip
app.delete('/:reserveId/skip', async c => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');
    const reserveId = parseInt(c.req.param('reserveId'), 10);

    try {
        const result = await reserveApiModel.removeSkip(reserveId);
        return api.responseJSON(c, 200, result);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// DELETE /api/reserves/:reserveId/overlap
app.delete('/:reserveId/overlap', async c => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');
    const reserveId = parseInt(c.req.param('reserveId'), 10);

    try {
        const result = await reserveApiModel.removeOverlap(reserveId);
        return api.responseJSON(c, 200, result);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

export default app;
