import { Hono } from 'hono';
import IChannelApiModel, { IChannelApiModelError } from '../../../api/channel/IChannelApiModel';
import container from '../../../ModelContainer';
import * as api from '../HonoApiUtil';

const app = new Hono();

// GET /api/channels
app.get('/', async c => {
    const channelApiModel = container.get<IChannelApiModel>('IChannelApiModel');

    try {
        const result = await channelApiModel.getChannels();
        return api.responseJSON(c, 200, result);
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// GET /api/channels/:channelId/logo
app.get('/:channelId/logo', async c => {
    const channelApiModel = container.get<IChannelApiModel>('IChannelApiModel');
    const channelId = parseInt(c.req.param('channelId'), 10);

    try {
        const result = await channelApiModel.getLogo(channelId);
        return new Response(result as any, {
            status: 200,
            headers: {
                'Content-Type': 'image/png',
            },
        });
    } catch (err: any) {
        if (err.message === IChannelApiModelError.NOT_FOUND) {
            return api.responseError(c, {
                code: 404,
                message: 'log file is not found',
            });
        }
        return api.responseServerError(c, err.message);
    }
});

export default app;
