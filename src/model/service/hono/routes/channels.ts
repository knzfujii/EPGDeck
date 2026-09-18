import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import IChannelApiModel, { IChannelApiModelError } from '../../../api/channel/IChannelApiModel.js';
import container from '../../../ModelContainer.js';
import { NotFoundError } from '../../../error/ApiError.js';
import { channelIdParamSchema } from '../schemas/channels.js';

const app = new Hono()
    // GET /api/channels
    .get('/', async c => {
        const channelApiModel = container.get<IChannelApiModel>('IChannelApiModel');
        const result = await channelApiModel.getChannels();
        return c.json(result);
    })
    // GET /api/channels/:channelId/logo
    .get('/:channelId/logo', zValidator('param', channelIdParamSchema), async c => {
        const channelApiModel = container.get<IChannelApiModel>('IChannelApiModel');
        const { channelId } = c.req.valid('param');

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
                throw new NotFoundError('log file is not found');
            }
            throw err;
        }
    });

export default app;
