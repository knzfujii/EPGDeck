import { Hono } from 'hono';
import IStorageApiModel from '../../../api/storage/IStorageApiModel.js';
import container from '../../../ModelContainer.js';

const app = new Hono()
    // GET /api/storages
    .get('/', async c => {
        const storageApiModel = container.get<IStorageApiModel>('IStorageApiModel');
        const info = await storageApiModel.getInfo();
        return c.json(info);
    });

export default app;
