import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import IIPTVApiModel from '../../../api/iptv/IIPTVApiModel.js';
import IConfiguration from '../../../IConfiguration.js';
import container from '../../../ModelContainer.js';
import * as api from '../HonoApiUtil.js';
import { BadRequestError } from '../../../error/ApiError.js';
import { iptvChannelQuerySchema, iptvEpgQuerySchema } from '../schemas/iptv.js';

const app = new Hono();

// GET /api/iptv/channel.m3u8
app.get('/channel.m3u8', zValidator('query', iptvChannelQuerySchema), async c => {
    const iptvApiModel = container.get<IIPTVApiModel>('IIPTVApiModel');
    const configuration = container.get<IConfiguration>('IConfiguration');
    const host = c.req.header('host');
    if (typeof host === 'undefined') {
        throw new BadRequestError('Host header is undefined', 'HostIsUndefined');
    }

    const { mode, isHalfWidth } = c.req.valid('query');
    const result = await iptvApiModel.getChannelList(
        host,
        api.isSecureProtocol(c),
        mode ?? 0,
        isHalfWidth,
        configuration.getConfig().server.subDirectory,
    );

    return new Response(result, {
        status: 200,
        headers: {
            'Content-Type': 'application/x-mpegURL; charset="UTF-8"',
        },
    });
});

// GET /api/iptv/epg.xml
app.get('/epg.xml', zValidator('query', iptvEpgQuerySchema), async c => {
    const iptvApiModel = container.get<IIPTVApiModel>('IIPTVApiModel');
    const { days, isHalfWidth } = c.req.valid('query');

    const result = await iptvApiModel.getEpg(days ?? 1, isHalfWidth);
    return new Response(result, {
        status: 200,
        headers: {
            'Content-Type': 'application/xml; charset="UTF-8"',
        },
    });
});

export default app;
