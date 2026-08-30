import { inject, injectable } from 'inversify';
import * as apid from '../../../../api';
import IConfiguration from '../../IConfiguration';
import IIPCClient from '../../ipc/IIPCClient';
import IConfigApiModel from './IConfigApiModel';

@injectable()
export default class ConfigApiModel implements IConfigApiModel {
    private configuration: IConfiguration;
    private ipc: IIPCClient;

    constructor(@inject('IConfiguration') configuration: IConfiguration, @inject('IIPCClient') ipc: IIPCClient) {
        this.configuration = configuration;
        this.ipc = ipc;
    }

    /**
     * コンフィグ設定を返す
     * @param isSecure: boolean https アクセスか?
     */
    public async getConfig(isSecure: boolean): Promise<apid.Config> {
        const config = this.configuration.getConfig();

        const result: apid.Config = <any>{};

        if (isSecure === true) {
            if (typeof config.server.https === 'undefined') {
                throw new Error('httpsConfigError');
            }
            result.socketIOPort = config.server.https.port;
        } else {
            if (typeof config.server.port === 'undefined') {
                throw new Error('httpConfigError');
            }
            result.socketIOPort = config.server.port;
        }

        result.recorded = config.recording.directories.map(r => {
            return r.name;
        });

        result.encode = config.encode.presets.map(e => {
            return e.name;
        });

        result.urlscheme = config.urlscheme
            ? {
                  m2ts: {
                      ios: config.urlscheme.m2ts.ios,
                      android: config.urlscheme.m2ts.android,
                      mac: config.urlscheme.m2ts.mac,
                      win: config.urlscheme.m2ts.win,
                  },
                  video: {
                      ios: config.urlscheme.video.ios,
                      android: config.urlscheme.video.android,
                      mac: config.urlscheme.video.mac,
                      win: config.urlscheme.video.win,
                  },
                  download: {
                      ios: config.urlscheme.download.ios,
                      android: config.urlscheme.download.android,
                      mac: config.urlscheme.download.mac,
                      win: config.urlscheme.download.win,
                  },
              }
            : <any>{};

        result.broadcast = await this.ipc.reserveation.getBroadcastStatus();
        result.isEnableTSLiveStream = false;
        result.isEnableTSRecordedStream = false;
        result.isEnableEncodedRecordedStream = false;

        const stream = config.streaming;
        if (typeof stream !== 'undefined') {
            result.streamConfig = {};

            // live stream
            if (typeof stream.live !== 'undefined') {
                result.streamConfig.live = {};
                if (typeof stream.live.ts !== 'undefined') {
                    result.isEnableTSLiveStream = true;
                    result.streamConfig.live.ts = {};

                    if (typeof stream.live.ts.m2ts !== 'undefined') {
                        result.streamConfig.live.ts.m2ts = stream.live.ts.m2ts.map(c => {
                            return {
                                name: c.name,
                                isUnconverted: typeof c.cmd === 'undefined',
                            };
                        });
                    }
                    if (typeof stream.live.ts.m2tsll !== 'undefined') {
                        result.streamConfig.live.ts.m2tsll = stream.live.ts.m2tsll.map(c => {
                            return c.name;
                        });
                    }
                    if (typeof stream.live.ts.webm !== 'undefined') {
                        result.streamConfig.live.ts.webm = stream.live.ts.webm.map(c => {
                            return c.name;
                        });
                    }
                    if (typeof stream.live.ts.mp4 !== 'undefined') {
                        result.streamConfig.live.ts.mp4 = stream.live.ts.mp4.map(c => {
                            return c.name;
                        });
                    }
                    if (typeof stream.live.ts.hls !== 'undefined') {
                        result.streamConfig.live.ts.hls = stream.live.ts.hls.map(c => {
                            return c.name;
                        });
                    }
                }
            }

            // recorded stream
            if (typeof stream.recorded !== 'undefined') {
                result.streamConfig.recorded = {};
                // ts
                if (typeof stream.recorded.ts !== 'undefined') {
                    result.streamConfig.recorded.ts = {};
                    result.isEnableTSRecordedStream = true;
                    if (typeof stream.recorded.ts.webm !== 'undefined') {
                        result.streamConfig.recorded.ts.webm = stream.recorded.ts.webm.map(c => {
                            return c.name;
                        });
                    }
                    if (typeof stream.recorded.ts.mp4 !== 'undefined') {
                        result.streamConfig.recorded.ts.mp4 = stream.recorded.ts.mp4.map(c => {
                            return c.name;
                        });
                    }
                    if (typeof stream.recorded.ts.hls !== 'undefined') {
                        result.streamConfig.recorded.ts.hls = stream.recorded.ts.hls.map(c => {
                            return c.name;
                        });
                    }
                }

                // encoded
                if (typeof stream.recorded.encoded !== 'undefined') {
                    result.streamConfig.recorded.encoded = {};
                    result.isEnableEncodedRecordedStream = true;
                    if (typeof stream.recorded.encoded.webm !== 'undefined') {
                        result.streamConfig.recorded.encoded.webm = stream.recorded.encoded.webm.map(c => {
                            return c.name;
                        });
                    }
                    if (typeof stream.recorded.encoded.mp4 !== 'undefined') {
                        result.streamConfig.recorded.encoded.mp4 = stream.recorded.encoded.mp4.map(c => {
                            return c.name;
                        });
                    }
                    if (typeof stream.recorded.encoded.hls !== 'undefined') {
                        result.streamConfig.recorded.encoded.hls = stream.recorded.encoded.hls.map(c => {
                            return c.name;
                        });
                    }
                }
            }
        }

        if (typeof config.kodi !== 'undefined') {
            result.kodiHosts = config.kodi.map(k => {
                return k.name;
            });
        }

        return result;
    }
}
