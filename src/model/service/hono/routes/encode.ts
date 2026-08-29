import { Hono } from 'hono';
import IEncodeApiModel from '../../../api/encode/IEncodeApiModel';
import container from '../../../ModelContainer';
import * as api from '../HonoApiUtil';

const app = new Hono();

// GET /api/encode
app.get('/', async c => {
    const encodeApiModel = container.get<IEncodeApiModel>('IEncodeApiModel');
    const isHalfWidth = c.req.query('isHalfWidth') === 'true';

    try {
        const result = await encodeApiModel.getAll(isHalfWidth);
        return api.responseJSON(c, 200, result);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// POST /api/encode
app.post('/', async c => {
    const encodeApiModel = container.get<IEncodeApiModel>('IEncodeApiModel');

    try {
        const body = await c.req.json();
        const encodeId = await encodeApiModel.add(body);
        return api.responseJSON(c, 201, { encodeId });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// DELETE /api/encode/:encodeId
app.delete('/:encodeId', async c => {
    const encodeApiModel = container.get<IEncodeApiModel>('IEncodeApiModel');
    const encodeId = parseInt(c.req.param('encodeId'), 10);

    try {
        await encodeApiModel.cancel(encodeId);
        return api.responseJSON(c, 200, { code: 200 });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

export default app;
