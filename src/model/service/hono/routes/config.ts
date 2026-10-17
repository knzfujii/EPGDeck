import { Hono } from 'hono';
import container from '../../../ModelContainer.js';
import * as api from '../HonoApiUtil.js';

const app = new Hono().get('/', async c => {
    const configApiModel = container.configApiModel;

    try {
        const result = await configApiModel.getConfig(api.isSecureProtocol(c));
        return c.json(result);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

export default app;
