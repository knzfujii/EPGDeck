import { inject, injectable } from 'inversify';
import * as path from 'path';
import StrUtil from '../../util/StrUtil';
import { KodiInfo } from '../IConfigFile';
import IConfiguration from '../IConfiguration';
import IApiUtil, { CreateM3U8Option } from './IApiUtil';

@injectable()
export default class ApiUtil implements IApiUtil {
    private configuration: IConfiguration;

    constructor(@inject('IConfiguration') configuration: IConfiguration) {
        this.configuration = configuration;
    }

    /**
     * m3u8 文字列を生成する
     * @param option: CreateM3U8Option
     * @return string
     */
    public createM3U8PlayListStr(option: CreateM3U8Option): string {
        const fullUrl = StrUtil.urlJoin(
            `${option.isSecure ? 'https' : 'http'}://${this.getHost(option.host)}`,
            option.baseUrl,
        );

        return '#EXTM3U\n' + `#EXTINF: ${option.duration}, ${option.name}\n` + fullUrl;
    }

    /**
     * host に サブディレクトリを追加して返す
     * @param baseHost: host
     * @return string
     */
    public getHost(baseHost: string): string {
        const config = this.configuration.getConfig();

        return typeof config.server.subDirectory === 'undefined'
            ? baseHost
            : path.join(baseHost, config.server.subDirectory);
    }

    /**
     * kodi へビデオリンクを送信する
     * @param source: ビデオリンク
     * @param kodiInfo: KodiInfo
     */
    public async sendToKodi(source: string, kodiInfo: KodiInfo): Promise<void> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (typeof kodiInfo.user !== 'undefined' && typeof kodiInfo.password !== 'undefined') {
            const authStr = Buffer.from(`${kodiInfo.user}:${kodiInfo.password}`).toString('base64');
            headers['Authorization'] = `Basic ${authStr}`;
        }

        const targetUrl = new URL('/jsonrpc', kodiInfo.host).toString();
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'Player.Open',
                params: {
                    item: { file: source },
                },
                id: 1,
            }),
        });

        if (!response.ok) {
            throw new Error(`Kodi request failed: ${response.status} ${response.statusText}`);
        }
    }
}
