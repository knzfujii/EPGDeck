import { Hono } from 'hono';
import IIPTVApiModel from '../../../api/iptv/IIPTVApiModel';
import IConfiguration from '../../../IConfiguration';
import container from '../../../ModelContainer';
import * as api from '../HonoApiUtil';

const app = new Hono();

// GET /api/iptv/channel.m3u8
app.get('/channel.m3u8', async c => {
    const iptvApiModel = container.get<IIPTVApiModel>('IIPTVApiModel');
    const configuration = container.get<IConfiguration>('IConfiguration');
    const host = c.req.header('host');

    try {
        if (typeof host === 'undefined') {
            throw new Error('HostIsUndefined');
        }

        const mode = parseInt(c.req.query('mode') || '0', 10);
        const isHalfWidth = c.req.query('isHalfWidth') === 'true';

        const result = await iptvApiModel.getChannelList(
            host,
            api.isSecureProtocol(c),
            mode,
            isHalfWidth,
            configuration.getConfig().server.subDirectory,
        );

        return new Response(result, {
            status: 200,
            headers: {
                'Content-Type': 'application/x-mpegURL; charset="UTF-8"',
            },
        });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

// GET /api/iptv/epg.xml
app.get('/epg.xml', async c => {
    const iptvApiModel = container.get<IIPTVApiModel>('IIPTVApiModel');
    const days = parseInt(c.req.query('days') || '1', 10);
    const isHalfWidth = c.req.query('isHalfWidth') === 'true';

    try {
        const result = await iptvApiModel.getEpg(days, isHalfWidth);
        return new Response(result, {
            status: 200,
            headers: {
                'Content-Type': 'application/xml; charset="UTF-8"',
            },
        });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

export default app;
