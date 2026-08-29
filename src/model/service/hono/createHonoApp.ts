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
    if (config.isAllowAllCORS === true) {
        app.use('*', cors());
    }

    // Helper for URL with subDirectory
    const createUrl = (urlStr: string): string => {
        return typeof config.subDirectory === 'undefined' ? urlStr : urljoin(config.subDirectory, urlStr);
    };

    // 3. OpenAPI Document
    const rootDir = path.join(__dirname, '..', '..', '..', '..');
    const apiYmlPath = path.join(rootDir, 'api.yml');
    const packageJsonPath = path.join(rootDir, 'package.json');

    const getApiDocument = (): OpenAPIV3.Document => {
        const doc = yaml.load(fs.readFileSync(apiYmlPath, 'utf-8')) as OpenAPIV3.Document;
        if (config.apiServers && config.apiServers.length > 0) {
            doc.servers = config.apiServers.map(url => ({
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
    apiApp.route('/encode', encodeRoute);
    apiApp.route('/iptv', iptvRoute);
    apiApp.route('/storages', storagesRoute);
    apiApp.route('/streams', streamsRoute);

    app.route(apiPrefix, apiApp);

    // 5. Static Files & SPA Fallback
    const staticDirs: { prefix: string; dir: string }[] = [
        { prefix: createUrl('/img'), dir: path.join(rootDir, 'img') },
        { prefix: createUrl('/thumbnail'), dir: config.thumbnail },
        { prefix: createUrl('/streamfiles'), dir: config.streamFilePath },
    ];

    for (const { prefix, dir } of staticDirs) {
        app.get(`${prefix}/:filename`, async c => {
            const filename = c.req.param('filename');
            const targetFile = path.join(dir, filename);
            if (fs.existsSync(targetFile)) {
                return await api.responseFile(c, targetFile, getMimeType(targetFile), false);
            }
            return c.notFound();
        });
    }

    // Client static files & SPA Fallback
    const clientDist = path.join(rootDir, 'client', 'dist');
    if (fs.existsSync(clientDist)) {
        app.get(`${createUrl('/')}*`, async c => {
            let reqPath = c.req.path;
            if (config.subDirectory && reqPath.startsWith(config.subDirectory)) {
                reqPath = reqPath.slice(config.subDirectory.length);
            }
            if (reqPath === '' || reqPath === '/') {
                reqPath = '/index.html';
            }

            const localPath = path.join(clientDist, reqPath);
            if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
                return await api.responseFile(c, localPath, getMimeType(localPath), false);
            }

            // SPA Fallback to index.html
            const indexPath = path.join(clientDist, 'index.html');
            if (fs.existsSync(indexPath)) {
                return await api.responseFile(c, indexPath, 'text/html', false);
            }

            return c.notFound();
        });
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
