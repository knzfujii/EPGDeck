import { Hono } from 'hono';
import IStorageApiModel from '../../../api/storage/IStorageApiModel';
import container from '../../../ModelContainer';
import * as api from '../HonoApiUtil';

const app = new Hono();

// GET /api/storages
app.get('/', async c => {
    const storageApiModel = container.get<IStorageApiModel>('IStorageApiModel');

    try {
        const info = await storageApiModel.getInfo();
        return api.responseJSON(c, 200, info);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

export default app;
