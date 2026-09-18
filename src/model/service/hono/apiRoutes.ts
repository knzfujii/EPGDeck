import { Hono } from 'hono';
import authRoute from './routes/auth.js';
import channelsRoute from './routes/channels.js';
import configRoute from './routes/config.js';
import dropLogsRoute from './routes/dropLogs.js';
import encodeRoute from './routes/encode.js';
import iptvRoute from './routes/iptv.js';
import logsRoute from './routes/logs.js';
import recordedRoute from './routes/recorded.js';
import recordingRoute from './routes/recording.js';
import reservesRoute from './routes/reserves.js';
import rulesRoute from './routes/rules.js';
import schedulesRoute from './routes/schedules.js';
import storagesRoute from './routes/storages.js';
import streamsRoute from './routes/streams.js';
import tagsRoute from './routes/tags.js';
import thumbnailsRoute from './routes/thumbnails.js';
import versionRoute from './routes/version.js';
import videosRoute from './routes/videos.js';

export const createApiRoutes = () =>
    new Hono()
        .route('/auth', authRoute)
        .route('/version', versionRoute)
        .route('/config', configRoute)
        .route('/channels', channelsRoute)
        .route('/schedules', schedulesRoute)
        .route('/reserves', reservesRoute)
        .route('/rules', rulesRoute)
        .route('/recorded', recordedRoute)
        .route('/recording', recordingRoute)
        .route('/tags', tagsRoute)
        .route('/thumbnails', thumbnailsRoute)
        .route('/videos', videosRoute)
        .route('/dropLogs', dropLogsRoute)
        .route('/logs', logsRoute)
        .route('/encode', encodeRoute)
        .route('/iptv', iptvRoute)
        .route('/storages', storagesRoute)
        .route('/streams', streamsRoute);

export type ApiRoutesType = ReturnType<typeof createApiRoutes>;
