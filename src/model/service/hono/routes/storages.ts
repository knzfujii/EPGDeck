import { Hono } from 'hono';
import container from '../../../ModelContainer.js';

const app = new Hono()
    // GET /api/storages
    .get('/', async c => {
        const storageApiModel = container.storageApiModel;
        const info = await storageApiModel.getInfo();
        return c.json(info);
    });

export default app;
