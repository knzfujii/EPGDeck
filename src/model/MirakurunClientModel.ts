import * as fs from 'fs';
import { inject, injectable } from 'inversify';
import { Client } from 'mirakurun';
import * as path from 'path';
import IConfigFile from './IConfigFile.js';
import IConfiguration from './IConfiguration.js';
import IMirakurunClientModel from './IMirakurunClientModel.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * mirakurun client のインスタンスを生成する
 */
@injectable()
export default class MirakurunClientModel implements IMirakurunClientModel {
    private client: Client;
    private config: IConfigFile;

    constructor(@inject('IConfiguration') conf: IConfiguration) {
        this.client = new Client();
        this.config = conf.getConfig();

        this.setClient();
    }

    /**
     * mirakurun client の設定
     */
    private setClient(): void {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json')).toString());
        const mirakurunPath = this.config.server.mirakurun;

        /**
         * Copyright (c) 2016 Yuki KAN and Chinachu Project Contributors
         * Released under the MIT license
         * http://opensource.org/licenses/mit-license.php
         */
        if (/\\\\.\\pipe/.test(mirakurunPath)) {
            this.client.socketPath = mirakurunPath;
        } else if (/(?:\/|\+)unix:/.test(mirakurunPath) === true) {
            const standardFormat = /^http\+unix:\/\/([^/]+)(\/?.*)$/;
            const legacyFormat = /^http:\/\/unix:([^:]+):?(.*)$/;

            if (standardFormat.test(mirakurunPath) === true) {
                this.client.socketPath = mirakurunPath.replace(standardFormat, '$1').replace(/%2F/g, '/');
                this.client.basePath = path.posix.join(
                    mirakurunPath.replace(standardFormat, '$2'),
                    this.client.basePath,
                );
            } else {
                this.client.socketPath = mirakurunPath.replace(legacyFormat, '$1');
                this.client.basePath = path.posix.join(mirakurunPath.replace(legacyFormat, '$2'), this.client.basePath);
            }
        } else {
            const parsedUrl = new URL(mirakurunPath);
            this.client.host = parsedUrl.hostname;
            this.client.port = parsedUrl.port ? Number(parsedUrl.port) : parsedUrl.protocol === 'https:' ? 443 : 80;
            this.client.basePath = path.posix.join(parsedUrl.pathname, <string>this.client.basePath);
        }

        this.client.userAgent = `${pkg.name}/${pkg.version}`;
    }

    /**
     * mirakurun client を返す
     * @return mirakurun client
     */
    public getClient(): Client {
        return this.client;
    }
}
