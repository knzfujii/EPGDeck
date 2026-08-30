import { getRequestListener } from '@hono/node-server';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import { inject, injectable } from 'inversify';
import { mkdirp } from 'mkdirp';
import * as path from 'path';
import IConfigFile from '../IConfigFile';
import IConfiguration from '../IConfiguration';
import ILogger from '../ILogger';
import ILoggerModel from '../ILoggerModel';
import IServiceServer from './IServiceServer';
import { createHonoApp } from './hono/createHonoApp';
import ISocketIOManageModel from './socketio/ISocketIOManageModel';

@injectable()
class ServiceServer implements IServiceServer {
    private log: ILogger;
    private config: IConfigFile;
    private socketIoManageModel: ISocketIOManageModel;
    private requestListener!: http.RequestListener;

    constructor(
        @inject('ILoggerModel') logger: ILoggerModel,
        @inject('IConfiguration') configuration: IConfiguration,
        @inject('ISocketIOManageModel')
        socketIoManageModel: ISocketIOManageModel,
    ) {
        this.log = logger.getLogger();
        this.config = configuration.getConfig();
        this.socketIoManageModel = socketIoManageModel;

        this.init();
    }

    /**
     * 初期化処理
     */
    private init(): void {
        this.createUploadDir();
        const honoApp = createHonoApp(this.config, this.log);
        this.requestListener = getRequestListener(honoApp.fetch);
    }

    /**
     * upload 用のディレクトリを生成する
     */
    private createUploadDir(): void {
        try {
            fs.statSync(this.config.recording.uploadTempDir);
        } catch {
            this.log.system.info(`mkdirp: ${this.config.recording.uploadTempDir}`);
            mkdirp.sync(this.config.recording.uploadTempDir);
        }
    }

    /**
     * http server 起動
     */
    public start(): void {
        const socketioServers: http.Server[] = [];

        // http
        if (typeof this.config.server.port !== 'undefined') {
            const server = http.createServer(this.requestListener);
            server.listen(this.config.server.port, () => {
                this.log.system.info(`http server listening on ${this.config.server.port}`);
            });
            socketioServers.push(server);
        }

        // https
        if (typeof this.config.server.https !== 'undefined') {
            const option: https.ServerOptions = {
                key: fs.readFileSync(this.config.server.https.key),
                cert: fs.readFileSync(this.config.server.https.cert),
            };
            if (typeof this.config.server.https.ca !== 'undefined') {
                if (typeof this.config.server.https.ca === 'string') {
                    option.ca = fs.readFileSync(this.config.server.https.ca);
                } else {
                    option.ca = this.config.server.https.ca.map(f => {
                        return fs.readFileSync(f);
                    });
                }
                option.requestCert = true;
                option.rejectUnauthorized = true;
            }

            const httpsServer = https.createServer(option, this.requestListener);
            httpsServer.listen(this.config.server.https.port, () => {
                if (typeof this.config.server.https !== 'undefined') {
                    this.log.system.info(`https server listening on ${this.config.server.https.port}`);
                }
            });
            socketioServers.push(httpsServer);
        }

        this.socketIoManageModel.initialize(socketioServers);
    }
}

namespace ServiceServer {
    export const ROOT_DIR = path.join(__dirname, '..', '..', '..');
    export const API_YML = path.join(ServiceServer.ROOT_DIR, 'api.yml');
    export const PACKAGE_JSON = path.join(ServiceServer.ROOT_DIR, 'package.json');
    export const SWAGGER_UI_DIST = path.join(ServiceServer.ROOT_DIR, 'node_modules', 'swagger-ui-dist');
    export const API_DIR = path.join(__dirname, 'api');
    export const CLIENT_DIR = path.join(ROOT_DIR, 'client', 'dist');
}

export default ServiceServer;
