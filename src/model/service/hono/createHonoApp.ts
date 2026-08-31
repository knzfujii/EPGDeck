import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { swaggerUI } from '@hono/swagger-ui';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import urljoin from 'url-join';
import { OpenAPIV3 } from 'openapi-types';
import IConfigFile from '../../IConfigFile';
import ILogger from '../../ILogger';

import channelsRoute from './routes/channels';
import configRoute from './routes/config';
import dropLogsRoute from './routes/dropLogs';
import logsRoute from './routes/logs';
import encodeRoute from './routes/encode';
import iptvRoute from './routes/iptv';
import recordedRoute from './routes/recorded';
import recordingRoute from './routes/recording';
import reservesRoute from './routes/reserves';
import rulesRoute from './routes/rules';
import schedulesRoute from './routes/schedules';
import storagesRoute from './routes/storages';
import streamsRoute from './routes/streams';
import tagsRoute from './routes/tags';
import thumbnailsRoute from './routes/thumbnails';
import versionRoute from './routes/version';
import videosRoute from './routes/videos';
import * as api from './HonoApiUtil';
import ProcessUtil from '../../../util/ProcessUtil';

export const createHonoApp = (config: IConfigFile, log: ILogger): Hono => {
    const app = new Hono();

    // 1. Access Logger Middleware
    app.use('*', async (c, next) => {
        const start = Date.now();
        await next();
        const duration = Date.now() - start;
        const method = c.req.method;
        const path = c.req.path;
        const status = c.res.status;
        log.access.info(`${method} ${path} ${status} - ${duration} ms`);
    });

    // 2. CORS
    if (config.server.isAllowAllCORS === true) {
        app.use('*', cors());
    }

    // Global Error Handler
    app.onError((err, c) => {
        log.system.error(`[Unhandled Error] ${c.req.method} ${c.req.path}`);
        log.system.error(err.stack || err.message);
        return api.responseServerError(c, err.message || 'Internal Server Error');
    });

    // Helper for URL with subDirectory
    const createUrl = (urlStr: string): string => {
        return typeof config.server.subDirectory === 'undefined' ? urlStr : urljoin(config.server.subDirectory, urlStr);
    };

    // 3. OpenAPI Document
    const rootDir = ProcessUtil.ROOT_PATH;
    const apiYmlPath = path.join(rootDir, 'api.yml');
    const packageJsonPath = path.join(rootDir, 'package.json');

    const getApiDocument = (): OpenAPIV3.Document => {
        const doc = yaml.load(fs.readFileSync(apiYmlPath, 'utf-8')) as OpenAPIV3.Document;
        if (config.server.apiServers && config.server.apiServers.length > 0) {
            doc.servers = config.server.apiServers.map(url => ({
                url: urljoin(url, createUrl('/api')),
            }));
        }
        try {
            const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            doc.info.title = pkg.name;
            doc.info.version = pkg.version;
        } catch {
            // ignore
        }
        return doc;
    };

    const apiDoc = getApiDocument();

    // Swagger UI & API Docs endpoints
    const docsUrl = createUrl('/api/docs');
    const swaggerUiUrl = createUrl('/api-docs');

    app.get(docsUrl, c => {
        return c.json(apiDoc);
    });

    app.get(
        `${swaggerUiUrl}/*`,
        swaggerUI({
            url: docsUrl,
        }),
    );
    app.get(
        swaggerUiUrl,
        swaggerUI({
            url: docsUrl,
        }),
    );

    app.get(createUrl('/api/debug'), c => {
        return c.redirect(`${swaggerUiUrl}/?url=${docsUrl}`);
    });

    // 4. API Routes
    const apiPrefix = createUrl('/api');
    const apiApp = new Hono();

    apiApp.route('/version', versionRoute);
    apiApp.route('/config', configRoute);
    apiApp.route('/channels', channelsRoute);
    apiApp.route('/schedules', schedulesRoute);
    apiApp.route('/reserves', reservesRoute);
    apiApp.route('/rules', rulesRoute);
    apiApp.route('/recorded', recordedRoute);
    apiApp.route('/recording', recordingRoute);
    apiApp.route('/tags', tagsRoute);
    apiApp.route('/thumbnails', thumbnailsRoute);
    apiApp.route('/videos', videosRoute);
    apiApp.route('/dropLogs', dropLogsRoute);
    apiApp.route('/logs', logsRoute);
    apiApp.route('/encode', encodeRoute);
    apiApp.route('/iptv', iptvRoute);
    apiApp.route('/storages', storagesRoute);
    apiApp.route('/streams', streamsRoute);

    app.route(apiPrefix, apiApp);

    // 5. Static Files & SPA Fallback
    const staticDirs: { prefix: string; dir: string }[] = [
        { prefix: createUrl('/img'), dir: path.join(rootDir, 'img') },
        { prefix: createUrl('/thumbnail'), dir: config.recording.thumbnail.path },
        { prefix: createUrl('/streamfiles'), dir: config.streaming?.tempDir || '' },
    ];

    for (const { prefix, dir } of staticDirs) {
        app.get(`${prefix}/:filename`, async c => {
            const filename = c.req.param('filename');
            const resolvedDir = path.resolve(dir);
            const targetFile = path.resolve(dir, filename);
            if (!targetFile.startsWith(resolvedDir + path.sep) && targetFile !== resolvedDir) {
                return c.notFound();
            }
            if (fs.existsSync(targetFile)) {
                return await api.responseFile(c, targetFile, getMimeType(targetFile), false);
            }
            return c.notFound();
        });
    }

    // Client static files & SPA Fallback
    const clientDist = path.join(rootDir, 'client', 'dist');
    const handleClientFile = async (c: any) => {
        let reqPath = c.req.path;
        if (config.server.subDirectory && reqPath.startsWith(config.server.subDirectory)) {
            reqPath = reqPath.slice(config.server.subDirectory.length);
        }
        if (reqPath === '' || reqPath === '/') {
            reqPath = '/index.html';
        }

        const resolvedClientDist = path.resolve(clientDist);
        const localPath = path.resolve(clientDist, reqPath.replace(/^\//, ''));
        if (!localPath.startsWith(resolvedClientDist + path.sep) && localPath !== resolvedClientDist) {
            return c.notFound();
        }
        if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
            return await api.responseFile(c, localPath, getMimeType(localPath), false);
        }

        // 静的アセット（拡張子を持つファイル）へのリクエストが存在しない場合は 404 を返す
        const ext = path.extname(reqPath);
        if (ext !== '' && ext !== '.html') {
            return c.notFound();
        }

        // SPA Fallback to index.html
        const indexPath = path.join(clientDist, 'index.html');
        if (fs.existsSync(indexPath)) {
            return await api.responseFile(c, indexPath, getMimeType(indexPath), false);
        }
        return c.notFound();
    };

    if (fs.existsSync(clientDist)) {
        app.get(createUrl('/'), handleClientFile);
        app.get(`${createUrl('/')}*`, handleClientFile);
        app.get('*', handleClientFile);
    }

    return app;
};

const getMimeType = (filePath: string): string => {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.html':
            return 'text/html';
        case '.css':
            return 'text/css';
        case '.js':
            return 'text/javascript';
        case '.json':
            return 'application/json';
        case '.png':
            return 'image/png';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.svg':
            return 'image/svg+xml';
        case '.ico':
            return 'image/x-icon';
        case '.woff':
            return 'application/font-woff';
        case '.woff2':
            return 'application/font-woff2';
        case '.ttf':
            return 'application/font-ttf';
        case '.ts':
            return 'video/mp2t';
        case '.mp4':
            return 'video/mp4';
        case '.webm':
            return 'video/webm';
        case '.m3u8':
            return 'application/x-mpegURL';
        case '.m4s':
            return 'application/octet-stream';
        case '.log':
            return 'text/plain';
        default:
            return 'application/octet-stream';
    }
};

export default createHonoApp;
