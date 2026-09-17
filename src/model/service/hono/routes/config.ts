import { Hono } from 'hono';
import IConfigApiModel from '../../../api/config/IConfigApiModel.js';
import container from '../../../ModelContainer.js';
import * as api from '../HonoApiUtil.js';

const app = new Hono();

app.get('/', async c => {
    const configApiModel = container.get<IConfigApiModel>('IConfigApiModel');

    try {
        const result = await configApiModel.getConfig(api.isSecureProtocol(c));
        return api.responseJSON(c, 200, result);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

export default app;
