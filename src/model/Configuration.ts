import * as fs from 'fs';
import { inject, injectable } from 'inversify';
import * as yaml from 'js-yaml';
import * as path from 'path';
import StrUtil from '../util/StrUtil';
import IConfigFile, { ReadOnlyOperation, StreamingConfig } from './IConfigFile';
import IConfiguration from './IConfiguration';
import ILogger from './ILogger';
import ILoggerModel from './ILoggerModel';

/**
 * Configuration
 * EPGDeck 構造化コンフィグ設定管理
 */
@injectable()
class Configuration implements IConfiguration {
    private config!: IConfigFile;
    private log: ILogger;

    constructor(@inject('ILoggerModel') logger: ILoggerModel) {
        this.log = logger.getLogger();

        const configFilePath = Configuration.getConfigFilePath();
        this.config = this.readConfig(configFilePath);
        this.log.system.info(`${path.basename(configFilePath)} read success`);

        fs.watchFile(configFilePath, async () => {
            this.log.system.info('updated config file');
            try {
                const newConfig = <any>yaml.load(await fs.promises.readFile(configFilePath, 'utf-8'));
                this.config = Configuration.formatAndValidateConfig(newConfig);
            } catch (err: any) {
                this.log.system.error('read config error');
                this.log.system.error(err);
            }
        });
    }

    /**
     * read config
     * @param configPath: ファイルパス
     * @return IConfigFile
     */
    private readConfig(configPath: string): IConfigFile {
        let str: string = '';
        try {
            str = fs.readFileSync(configPath, 'utf-8');
        } catch (e: any) {
            const errMsg = `${configPath} is not found`;
            this.log.system.fatal(errMsg);
            process.exit(1);
        }

        const rawConfig: any = yaml.load(str) || {};
        try {
            return Configuration.formatAndValidateConfig(rawConfig, { checkDirectories: true });
        } catch (err: any) {
            this.log.system.fatal(`Config validation failed: ${err.message}`);
            process.exit(1);
        }
    }

    /**
     * 設定のバリデーションとデフォルト値マージ & パス整形
     */
    public static formatAndValidateConfig(raw: any, options: { checkDirectories?: boolean } = {}): IConfigFile {
        if (!raw || typeof raw !== 'object') {
            throw new Error('Config file is empty or not a valid YAML object');
        }

        // 1. サーバー基本設定
        const server = raw.server || {};
        const port = typeof server.port === 'number' ? server.port : 8889;
        const mirakurun = server.mirakurun || server.mirakurunPath || 'http+unix://%2Fvar%2Frun%2Fmirakurun.sock/';
        const subDirectory =
            typeof server.subDirectory === 'string'
                ? StrUtil.urlJoin('/', server.subDirectory).replace(/\/$/, '')
                : undefined;

        if (typeof server.port === 'undefined' && (!server.https || !server.https.port)) {
            throw new Error('PortSettingError: server.port is required');
        }

        if (typeof server.port === 'number' && (server.port < 1 || server.port > 65535)) {
            throw new Error(`Invalid server port: ${server.port}`);
        }

        const apiServers =
            Array.isArray(server.apiServers) && server.apiServers.length > 0
                ? server.apiServers
                : [`http://localhost:${port}`];

        // 2. データベース設定
        const db = raw.database || {};
        const dbtype = db.type || raw.dbtype || 'sqlite';

        // 3. ログ設定
        const logConf = raw.log || {};
        const log: IConfigFile['log'] = {
            level: logConf.level || 'info',
            console: typeof logConf.console === 'boolean' ? logConf.console : true,
            file: {
                enabled: typeof logConf.file?.enabled === 'boolean' ? logConf.file.enabled : true,
                path: Configuration.directoryFormatting(
                    logConf.file?.path || path.join(Configuration.ROOT_PATH, 'logs', 'epgdeck.log'),
                ),
                maxSize: logConf.file?.maxSize || 10 * 1024 * 1024,
                backups: logConf.file?.backups || 5,
            },
            bufferSize: logConf.bufferSize || 1000,
        };

        // 4. EPG 設定
        const epgConf = raw.epg || {};
        const epg = {
            intervalMinutes:
                typeof epgConf.intervalMinutes === 'number' ? epgConf.intervalMinutes : raw.epgUpdateIntervalTime || 10,
            replaceEnclosingCharacters:
                typeof epgConf.replaceEnclosingCharacters === 'boolean'
                    ? epgConf.replaceEnclosingCharacters
                    : typeof raw.needToReplaceEnclosingCharacters === 'boolean'
                      ? raw.needToReplaceEnclosingCharacters
                      : true,
            channelOrder: epgConf.channelOrder || raw.channelOrder,
            sidOrder: epgConf.sidOrder || raw.sidOrder,
            excludeChannels: epgConf.excludeChannels || raw.excludeChannels,
            excludeSids: epgConf.excludeSids || raw.excludeSids,
        };

        // 5. 録画設定
        const recConf = raw.recording || {};
        const rawDirs = recConf.directories ||
            raw.recorded || [{ name: 'recorded', path: path.join(Configuration.ROOT_PATH, 'recorded') }];
        const directories = rawDirs
            .map((r: any) => ({
                name: r.name,
                path: Configuration.directoryFormatting(r.path),
                limitThreshold: r.limitThreshold,
                action: r.action,
                limitCmd: r.limitCmd,
            }))
            .filter((r: any) => r.name !== 'tmp');

        const thumbConf = recConf.thumbnail || {};
        const thumbFormat: 'jpeg' | 'webp' = thumbConf.format === 'webp' ? 'webp' : 'jpeg';
        const defaultCmd =
            thumbFormat === 'webp'
                ? '%FFMPEG% -ss %THUMBNAIL_POSITION% -y -i %INPUT% -vframes 1 -c:v libwebp -s %THUMBNAIL_SIZE% %OUTPUT%'
                : '%FFMPEG% -ss %THUMBNAIL_POSITION% -y -i %INPUT% -vframes 1 -f image2 -s %THUMBNAIL_SIZE% %OUTPUT%';

        const thumbnail = {
            path: Configuration.directoryFormatting(
                thumbConf.path || raw.thumbnail || path.join(Configuration.ROOT_PATH, 'thumbnail'),
            ),
            cmd: thumbConf.cmd || raw.thumbnailCmd || defaultCmd,
            size: thumbConf.size || raw.thumbnailSize || '480x270',
            positionSeconds:
                typeof thumbConf.positionSeconds === 'number' ? thumbConf.positionSeconds : raw.thumbnailPosition || 5,
            format: thumbFormat,
        };

        const dropLogConf = recConf.dropLog || {};
        const dropLog = {
            path: Configuration.directoryFormatting(
                dropLogConf.path || raw.dropLog || path.join(Configuration.ROOT_PATH, 'drop'),
            ),
            enabled: typeof dropLogConf.enabled === 'boolean' ? dropLogConf.enabled : raw.isEnabledDropCheck || false,
            deleteOnNoDrop: typeof dropLogConf.deleteOnNoDrop === 'boolean' ? dropLogConf.deleteOnNoDrop : true,
        };

        const priorityConf = recConf.priority || {};
        const priority = {
            conflict: typeof priorityConf.conflict === 'number' ? priorityConf.conflict : raw.conflictPriority || 1,
            recording: typeof priorityConf.recording === 'number' ? priorityConf.recording : raw.recPriority || 2,
            streaming: typeof priorityConf.streaming === 'number' ? priorityConf.streaming : raw.streamingPriority || 0,
        };

        const recording: IConfigFile['recording'] = {
            filenameFormat: recConf.filenameFormat || raw.recordedFormat || '%YEAR%_%MONTH%_%DAY%_%HOUR%%MIN%-%TITLE%',
            fileExtension: recConf.fileExtension || raw.recordedFileExtension || '.m2ts',
            directories,
            tempDir: recConf.tempDir
                ? Configuration.directoryFormatting(recConf.tempDir)
                : raw.recordedTmp
                  ? Configuration.directoryFormatting(raw.recordedTmp)
                  : undefined,
            historyRetentionDays:
                typeof recConf.historyRetentionDays === 'number'
                    ? recConf.historyRetentionDays
                    : typeof raw.recordedHistoryRetentionPeriodDays === 'number'
                      ? raw.recordedHistoryRetentionPeriodDays
                      : 90,
            storageCheckIntervalSeconds: recConf.storageCheckIntervalSeconds || raw.storageLimitCheckIntervalTime || 60,
            priority,
            timeSpecifiedStartMargin:
                typeof recConf.timeSpecifiedStartMargin === 'number'
                    ? recConf.timeSpecifiedStartMargin
                    : raw.timeSpecifiedStartMargin || 1,
            timeSpecifiedEndMargin:
                typeof recConf.timeSpecifiedEndMargin === 'number'
                    ? recConf.timeSpecifiedEndMargin
                    : raw.timeSpecifiedEndMargin || 1,
            thumbnail,
            dropLog,
            uploadTempDir: Configuration.directoryFormatting(
                recConf.uploadTempDir || raw.uploadTempDir || path.join(Configuration.ROOT_PATH, 'data', 'upload'),
            ),
        };

        if (options.checkDirectories) {
            const dirsToCheck: { path: string; name: string }[] = [
                ...directories,
                { path: thumbnail.path, name: 'thumbnail' },
                { path: recording.uploadTempDir, name: 'uploadTempDir' },
            ];
            if (dropLog.enabled || dropLog.path) {
                dirsToCheck.push({ path: dropLog.path, name: 'dropLog' });
            }

            for (const dir of dirsToCheck) {
                let stat: fs.Stats;
                try {
                    stat = fs.statSync(dir.path);
                } catch (e: any) {
                    if (e.code === 'ENOTDIR') {
                        throw new Error(`Path exists but is not a directory: "${dir.path}" (name: "${dir.name}")`);
                    }
                    if (e.code === 'ENOENT' || !e.code) {
                        try {
                            fs.mkdirSync(dir.path, { recursive: true });
                            stat = fs.statSync(dir.path);
                        } catch (mkdirErr: any) {
                            throw new Error(
                                `Recording directory not found: "${dir.path}" (name: "${dir.name}", failed to create: ${mkdirErr.message})`,
                            );
                        }
                    } else {
                        throw e;
                    }
                }
                if (!stat.isDirectory()) {
                    throw new Error(`Path exists but is not a directory: "${dir.path}" (name: "${dir.name}")`);
                }
            }
        }

        // 6. エンコード設定
        const encConf = raw.encode || {};
        const binaries = {
            ffmpeg: encConf.binaries?.ffmpeg || raw.ffmpeg || '/usr/bin/ffmpeg',
            ffprobe: encConf.binaries?.ffprobe || raw.ffprobe || '/usr/bin/ffprobe',
        };
        const rawPresets = Array.isArray(encConf.presets)
            ? encConf.presets
            : Array.isArray(raw.encode)
              ? raw.encode
              : [];
        const globalSubtitle = typeof encConf.subtitle === 'boolean' ? encConf.subtitle : false;
        const presets = rawPresets.map((p: any) => {
            const preset = { ...p };
            if (preset.script && !preset.cmd) {
                preset.cmd = `%NODE% %ROOT%/config/${preset.script}`;
            }
            preset.subtitle = typeof p.subtitle === 'boolean' ? p.subtitle : globalSubtitle;
            return preset;
        });

        const encode: IConfigFile['encode'] = {
            binaries,
            maxProcesses: typeof encConf.maxProcesses === 'number' ? encConf.maxProcesses : raw.encodeProcessNum || 2,
            concurrency: typeof encConf.concurrency === 'number' ? encConf.concurrency : raw.concurrentEncodeNum || 1,
            presets,
        };

        // 7. 外部連携 & URL Scheme
        const rawUrlscheme = raw.urlscheme || {};
        const urlscheme: IConfigFile['urlscheme'] = {
            m2ts: {
                ...Configuration.DEFAULT_URL_SCHEME.m2ts,
                ...(rawUrlscheme.m2ts || {}),
            },
            video: {
                ...Configuration.DEFAULT_URL_SCHEME.video,
                ...(rawUrlscheme.video || {}),
            },
            download: {
                ...Configuration.DEFAULT_URL_SCHEME.download,
                ...(rawUrlscheme.download || {}),
            },
        };

        // 8. ストリーミング設定 (内部デフォルトとマージ)
        const rawStream = raw.streaming || raw.stream || {};
        const streaming: StreamingConfig = {
            tempDir: Configuration.directoryFormatting(
                rawStream.tempDir || raw.streamFilePath || path.join(Configuration.ROOT_PATH, 'data', 'streamfiles'),
            ),
            live: rawStream.live || Configuration.DEFAULT_STREAMING.live,
            recorded: rawStream.recorded || Configuration.DEFAULT_STREAMING.recorded,
        };

        const config: IConfigFile = {
            server: {
                port,
                mirakurun,
                subDirectory,
                https: server.https,
                uid: server.uid || raw.uid,
                gid: server.gid || raw.gid,
                apiServers,
                isAllowAllCORS:
                    typeof server.isAllowAllCORS === 'boolean' ? server.isAllowAllCORS : raw.isAllowAllCORS || false,
            },
            database: {
                type: dbtype,
                sqlite: db.sqlite || raw.sqlite,
                mysql: db.mysql || raw.mysql,
                postgres: db.postgres || raw.postgres,
            },
            log,
            epg,
            recording,
            encode,
            hooks: raw.hooks || {
                reserveNewAddition: raw.reserveNewAddtionCommand,
                reserveUpdate: raw.reserveUpdateCommand,
                reserveDeleted: raw.reservedeletedCommand,
                recordingPreStart: raw.recordingPreStartCommand,
                recordingPrepRecFailed: raw.recordingPrepRecFailedCommand,
                recordingStart: raw.recordingStartCommand,
                recordingFinish: raw.recordingFinishCommand,
                recordingFailed: raw.recordingFailedCommand,
                encodingFinish: raw.encodingFinishCommand,
                isSuppressReservesUpdateAllLog: raw.isSuppressReservesUpdateAllLog || false,
            },
            urlscheme,
            streaming,
            kodi: raw.kodi || raw.kodiHosts,
        };

        // 11. リードオンリー設定 (ReadOnly)
        if (raw.readOnly) {
            const envPassword = process.env.EPGDECK_ADMIN_PASSWORD || process.env.EPGDECK_READONLY_PASSWORD;
            const password = typeof raw.readOnly.password === 'string' ? raw.readOnly.password : envPassword;
            const validOps: ReadOnlyOperation[] = [
                'liveStream',
                'recordedStream',
                'download',
                'dashboard',
                'search',
                'rules',
                'encode',
            ];
            const allowedOperations = Array.isArray(raw.readOnly.allowedOperations)
                ? (raw.readOnly.allowedOperations.filter((op: any) => validOps.includes(op)) as ReadOnlyOperation[])
                : [];

            config.readOnly = {
                enabled: raw.readOnly.enabled === true,
                password: password || undefined,
                allowedOperations,
            };
        } else if (process.env.EPGDECK_ADMIN_PASSWORD || process.env.EPGDECK_READONLY_PASSWORD) {
            config.readOnly = {
                enabled: true,
                password: process.env.EPGDECK_ADMIN_PASSWORD || process.env.EPGDECK_READONLY_PASSWORD,
                allowedOperations: [],
            };
        }

        return config;
    }

    /**
     * 引数で渡されたディレクトリの末尾のパス区切り文字を削除する
     */
    private static directoryFormatting(dir: string): string {
        return dir.replace(/%ROOT%/g, Configuration.ROOT_PATH).replace(new RegExp(`\\${path.sep}$`), '');
    }

    /**
     * コンフィグ設定を返す
     */
    public getConfig(): IConfigFile {
        return JSON.parse(JSON.stringify(this.config));
    }
}

namespace Configuration {
    export const getConfigFilePath = (): string => {
        if (process.env.EPGDECK_CONFIG_PATH) {
            return process.env.EPGDECK_CONFIG_PATH;
        }
        if (process.env.NODE_ENV === 'test') {
            const testConfigPath = path.join(__dirname, '..', '..', 'config', 'config.test.yml');
            if (fs.existsSync(testConfigPath)) {
                return testConfigPath;
            }
            throw new Error(`Test configuration file not found: ${testConfigPath}`);
        }
        return path.join(__dirname, '..', '..', 'config', 'config.yml');
    };
    export const CONFIG_FILE_PATH = getConfigFilePath();
    export const CONFIG_TEMPLATE_FILE_PATH = path.join(__dirname, '..', '..', 'config', 'config.yml.template');
    export const ROOT_PATH = path.join(__dirname, '..', '..').replace(new RegExp(`\\${path.sep}$`), '');

    export const DEFAULT_URL_SCHEME = {
        m2ts: {
            ios: 'vlc-x-callback://x-callback-url/stream?url=PROTOCOL%3A%2F%2FADDRESS',
            android: 'intent://ADDRESS#Intent;action=android.intent.action.VIEW;type=video/*;scheme=PROTOCOL;end',
        },
        video: {
            ios: 'infuse://x-callback-url/play?url=PROTOCOL://ADDRESS',
            android: 'intent://ADDRESS#Intent;action=android.intent.action.VIEW;type=video/*;scheme=PROTOCOL;end',
        },
        download: {
            ios: 'vlc-x-callback://x-callback-url/download?url=PROTOCOL%3A%2F%2FADDRESS&filename=FILENAME',
        },
    };

    /**
     * 内部標準ストリーミングコマンド定義
     */
    export const DEFAULT_STREAMING: StreamingConfig = {
        live: {
            ts: {
                m2ts: [
                    {
                        name: '1080p',
                        cmd: '%FFMPEG% -re -dual_mono_mode main -i pipe:0 -sn -threads 0 -c:a aac -ar 48000 -b:a 192k -ac 2 -c:v libx264 -vf yadif,scale=-2:1080 -b:v 6000k -preset veryfast -y -f mpegts pipe:1',
                    },
                    {
                        name: '720p',
                        cmd: '%FFMPEG% -re -dual_mono_mode main -i pipe:0 -sn -threads 0 -c:a aac -ar 48000 -b:a 192k -ac 2 -c:v libx264 -vf yadif,scale=-2:720 -b:v 3000k -preset veryfast -y -f mpegts pipe:1',
                    },
                    {
                        name: '480p',
                        cmd: '%FFMPEG% -re -dual_mono_mode main -i pipe:0 -sn -threads 0 -c:a aac -ar 48000 -b:a 128k -ac 2 -c:v libx264 -vf yadif,scale=-2:480 -b:v 1500k -preset veryfast -y -f mpegts pipe:1',
                    },
                    {
                        name: '無変換',
                    },
                ],
                m2tsll: [
                    {
                        name: '1080p',
                        cmd: '%FFMPEG% -dual_mono_mode main -f mpegts -analyzeduration 500000 -i pipe:0 -map 0 -c:s copy -c:d copy -ignore_unknown -fflags nobuffer -flags low_delay -max_delay 250000 -max_interleave_delta 1 -threads 0 -c:a aac -ar 48000 -b:a 192k -ac 2 -c:v libx264 -flags +cgop -vf yadif,scale=-2:1080 -b:v 6000k -preset veryfast -y -f mpegts pipe:1',
                    },
                    {
                        name: '720p',
                        cmd: '%FFMPEG% -dual_mono_mode main -f mpegts -analyzeduration 500000 -i pipe:0 -map 0 -c:s copy -c:d copy -ignore_unknown -fflags nobuffer -flags low_delay -max_delay 250000 -max_interleave_delta 1 -threads 0 -c:a aac -ar 48000 -b:a 192k -ac 2 -c:v libx264 -flags +cgop -vf yadif,scale=-2:720 -b:v 3000k -preset veryfast -y -f mpegts pipe:1',
                    },
                    {
                        name: '480p',
                        cmd: '%FFMPEG% -dual_mono_mode main -f mpegts -analyzeduration 500000 -i pipe:0 -map 0 -c:s copy -c:d copy -ignore_unknown -fflags nobuffer -flags low_delay -max_delay 250000 -max_interleave_delta 1 -threads 0 -c:a aac -ar 48000 -b:a 128k -ac 2 -c:v libx264 -flags +cgop -vf yadif,scale=-2:480 -b:v 1500k -preset veryfast -y -f mpegts pipe:1',
                    },
                ],
                webm: [
                    {
                        name: '1080p',
                        cmd: '%FFMPEG% -re -dual_mono_mode main -i pipe:0 -sn -threads 3 -c:a libvorbis -ar 48000 -b:a 192k -ac 2 -c:v libvpx-vp9 -vf yadif,scale=-2:1080 -b:v 6000k -deadline realtime -speed 4 -cpu-used -8 -y -f webm pipe:1',
                    },
                    {
                        name: '720p',
                        cmd: '%FFMPEG% -re -dual_mono_mode main -i pipe:0 -sn -threads 3 -c:a libvorbis -ar 48000 -b:a 192k -ac 2 -c:v libvpx-vp9 -vf yadif,scale=-2:720 -b:v 3000k -deadline realtime -speed 4 -cpu-used -8 -y -f webm pipe:1',
                    },
                    {
                        name: '480p',
                        cmd: '%FFMPEG% -re -dual_mono_mode main -i pipe:0 -sn -threads 2 -c:a libvorbis -ar 48000 -b:a 128k -ac 2 -c:v libvpx-vp9 -vf yadif,scale=-2:480 -b:v 1500k -deadline realtime -speed 4 -cpu-used -8 -y -f webm pipe:1',
                    },
                ],
                mp4: [
                    {
                        name: '1080p',
                        cmd: '%FFMPEG% -re -dual_mono_mode main -i pipe:0 -sn -threads 0 -c:a aac -ar 48000 -b:a 192k -ac 2 -c:v libx264 -vf yadif,scale=-2:1080 -b:v 6000k -profile:v baseline -preset veryfast -tune fastdecode,zerolatency -movflags frag_keyframe+empty_moov+faststart+default_base_moof -y -f mp4 pipe:1',
                    },
                    {
                        name: '720p',
                        cmd: '%FFMPEG% -re -dual_mono_mode main -i pipe:0 -sn -threads 0 -c:a aac -ar 48000 -b:a 192k -ac 2 -c:v libx264 -vf yadif,scale=-2:720 -b:v 3000k -profile:v baseline -preset veryfast -tune fastdecode,zerolatency -movflags frag_keyframe+empty_moov+faststart+default_base_moof -y -f mp4 pipe:1',
                    },
                    {
                        name: '480p',
                        cmd: '%FFMPEG% -re -dual_mono_mode main -i pipe:0 -sn -threads 0 -c:a aac -ar 48000 -b:a 128k -ac 2 -c:v libx264 -vf yadif,scale=-2:480 -b:v 1500k -profile:v baseline -preset veryfast -tune fastdecode,zerolatency -movflags frag_keyframe+empty_moov+faststart+default_base_moof -y -f mp4 pipe:1',
                    },
                ],
                hls: [
                    {
                        name: '1080p',
                        cmd: '%FFMPEG% -dual_mono_mode main -i pipe:0 -sn -map 0 -c:d copy -threads 0 -ignore_unknown -max_muxing_queue_size 1024 -f hls -hls_time 3 -hls_list_size 17 -hls_allow_cache 1 -hls_segment_filename %streamFileDir%/stream%streamNum%-%09d.ts -hls_flags delete_segments -c:a aac -ar 48000 -b:a 192k -ac 2 -c:v libx264 -flags +cgop -vf yadif,scale=-2:1080 -b:v 6000k -preset veryfast -flags +loop-global_header %OUTPUT%',
                    },
                    {
                        name: '720p',
                        cmd: '%FFMPEG% -dual_mono_mode main -i pipe:0 -sn -map 0 -c:d copy -threads 0 -ignore_unknown -max_muxing_queue_size 1024 -f hls -hls_time 3 -hls_list_size 17 -hls_allow_cache 1 -hls_segment_filename %streamFileDir%/stream%streamNum%-%09d.ts -hls_flags delete_segments -c:a aac -ar 48000 -b:a 192k -ac 2 -c:v libx264 -flags +cgop -vf yadif,scale=-2:720 -b:v 3000k -preset veryfast -flags +loop-global_header %OUTPUT%',
                    },
                    {
                        name: '480p',
                        cmd: '%FFMPEG% -dual_mono_mode main -i pipe:0 -sn -map 0 -c:d copy -threads 0 -ignore_unknown -max_muxing_queue_size 1024 -f hls -hls_time 3 -hls_list_size 17 -hls_allow_cache 1 -hls_segment_filename %streamFileDir%/stream%streamNum%-%09d.ts -hls_flags delete_segments -c:a aac -ar 48000 -b:a 128k -ac 2 -c:v libx264 -flags +cgop -vf yadif,scale=-2:480 -b:v 1500k -preset veryfast -flags +loop-global_header %OUTPUT%',
                    },
                ],
            },
        },
        recorded: {
            ts: {
                webm: [
                    {
                        name: '1080p',
                        cmd: '%FFMPEG% -dual_mono_mode main -i pipe:0 -sn -threads 3 -c:a libvorbis -ar 48000 -b:a 192k -ac 2 -c:v libvpx-vp9 -vf yadif,scale=-2:1080 -b:v 6000k -deadline realtime -speed 4 -cpu-used -8 -y -f webm pipe:1',
                    },
                    {
                        name: '720p',
                        cmd: '%FFMPEG% -dual_mono_mode main -i pipe:0 -sn -threads 3 -c:a libvorbis -ar 48000 -b:a 192k -ac 2 -c:v libvpx-vp9 -vf yadif,scale=-2:720 -b:v 3000k -deadline realtime -speed 4 -cpu-used -8 -y -f webm pipe:1',
                    },
                    {
                        name: '480p',
                        cmd: '%FFMPEG% -dual_mono_mode main -i pipe:0 -sn -threads 3 -c:a libvorbis -ar 48000 -b:a 128k -ac 2 -c:v libvpx-vp9 -vf yadif,scale=-2:480 -b:v 1500k -deadline realtime -speed 4 -cpu-used -8 -y -f webm pipe:1',
                    },
                ],
                mp4: [
                    {
                        name: '1080p',
                        cmd: '%FFMPEG% -dual_mono_mode main -i pipe:0 -sn -threads 0 -c:a aac -ar 48000 -b:a 192k -ac 2 -c:v libx264 -vf yadif,scale=-2:1080 -b:v 6000k -profile:v baseline -preset veryfast -tune fastdecode,zerolatency -movflags frag_keyframe+empty_moov+faststart+default_base_moof -y -f mp4 pipe:1',
                    },
                    {
                        name: '720p',
                        cmd: '%FFMPEG% -dual_mono_mode main -i pipe:0 -sn -threads 0 -c:a aac -ar 48000 -b:a 192k -ac 2 -c:v libx264 -vf yadif,scale=-2:720 -b:v 3000k -profile:v baseline -preset veryfast -tune fastdecode,zerolatency -movflags frag_keyframe+empty_moov+faststart+default_base_moof -y -f mp4 pipe:1',
                    },
                    {
                        name: '480p',
                        cmd: '%FFMPEG% -dual_mono_mode main -i pipe:0 -sn -threads 0 -c:a aac -ar 48000 -b:a 128k -ac 2 -c:v libx264 -vf yadif,scale=-2:480 -b:v 1500k -profile:v baseline -preset veryfast -tune fastdecode,zerolatency -movflags frag_keyframe+empty_moov+faststart+default_base_moof -y -f mp4 pipe:1',
                    },
                ],
                hls: [
                    {
                        name: '1080p',
                        cmd: '%FFMPEG% -dual_mono_mode main -i pipe:0 -sn -map 0 -c:d copy -threads 0 -ignore_unknown -max_muxing_queue_size 1024 -f hls -hls_time 3 -hls_list_size 0 -hls_allow_cache 1 -hls_segment_filename %streamFileDir%/stream%streamNum%-%09d.ts -hls_flags delete_segments -c:a aac -ar 48000 -b:a 192k -ac 2 -c:v libx264 -flags +cgop -vf yadif,scale=-2:1080 -b:v 6000k -preset veryfast -flags +loop-global_header %OUTPUT%',
                    },
                    {
                        name: '720p',
                        cmd: '%FFMPEG% -dual_mono_mode main -i pipe:0 -sn -map 0 -c:d copy -threads 0 -ignore_unknown -max_muxing_queue_size 1024 -f hls -hls_time 3 -hls_list_size 0 -hls_allow_cache 1 -hls_segment_filename %streamFileDir%/stream%streamNum%-%09d.ts -hls_flags delete_segments -c:a aac -ar 48000 -b:a 192k -ac 2 -c:v libx264 -flags +cgop -vf yadif,scale=-2:720 -b:v 3000k -preset veryfast -flags +loop-global_header %OUTPUT%',
                    },
                    {
                        name: '480p',
                        cmd: '%FFMPEG% -dual_mono_mode main -i pipe:0 -sn -map 0 -c:d copy -threads 0 -ignore_unknown -max_muxing_queue_size 1024 -f hls -hls_time 3 -hls_list_size 0 -hls_allow_cache 1 -hls_segment_filename %streamFileDir%/stream%streamNum%-%09d.ts -hls_flags delete_segments -c:a aac -ar 48000 -b:a 128k -ac 2 -c:v libx264 -flags +cgop -vf yadif,scale=-2:480 -b:v 1500k -preset veryfast -flags +loop-global_header %OUTPUT%',
                    },
                ],
            },
            encoded: {
                webm: [
                    {
                        name: '1080p',
                        cmd: '%FFMPEG% -dual_mono_mode main -ss %SS% -i %INPUT% -sn -threads 3 -c:a libvorbis -ar 48000 -b:a 192k -ac 2 -c:v libvpx-vp9 -vf scale=-2:1080 -b:v 6000k -deadline realtime -speed 4 -cpu-used -8 -y -f webm pipe:1',
                    },
                    {
                        name: '720p',
                        cmd: '%FFMPEG% -dual_mono_mode main -ss %SS% -i %INPUT% -sn -threads 3 -c:a libvorbis -ar 48000 -b:a 192k -ac 2 -c:v libvpx-vp9 -vf scale=-2:720 -b:v 3000k -deadline realtime -speed 4 -cpu-used -8 -y -f webm pipe:1',
                    },
                    {
                        name: '480p',
                        cmd: '%FFMPEG% -dual_mono_mode main -ss %SS% -i %INPUT% -sn -threads 3 -c:a libvorbis -ar 48000 -b:a 128k -ac 2 -c:v libvpx-vp9 -vf scale=-2:480 -b:v 1500k -deadline realtime -speed 4 -cpu-used -8 -y -f webm pipe:1',
                    },
                ],
                mp4: [
                    {
                        name: '1080p',
                        cmd: '%FFMPEG% -dual_mono_mode main -ss %SS% -i %INPUT% -sn -threads 0 -c:a aac -ar 48000 -b:a 192k -ac 2 -c:v libx264 -vf scale=-2:1080 -b:v 6000k -profile:v baseline -preset veryfast -tune fastdecode,zerolatency -movflags frag_keyframe+empty_moov+faststart+default_base_moof -y -f mp4 pipe:1',
                    },
                    {
                        name: '720p',
                        cmd: '%FFMPEG% -dual_mono_mode main -ss %SS% -i %INPUT% -sn -threads 0 -c:a aac -ar 48000 -b:a 192k -ac 2 -c:v libx264 -vf scale=-2:720 -b:v 3000k -profile:v baseline -preset veryfast -tune fastdecode,zerolatency -movflags frag_keyframe+empty_moov+faststart+default_base_moof -y -f mp4 pipe:1',
                    },
                    {
                        name: '480p',
                        cmd: '%FFMPEG% -dual_mono_mode main -ss %SS% -i %INPUT% -sn -threads 0 -c:a aac -ar 48000 -b:a 128k -ac 2 -c:v libx264 -vf scale=-2:480 -b:v 1500k -profile:v baseline -preset veryfast -tune fastdecode,zerolatency -movflags frag_keyframe+empty_moov+faststart+default_base_moof -y -f mp4 pipe:1',
                    },
                ],
                hls: [
                    {
                        name: '1080p',
                        cmd: '%FFMPEG% -dual_mono_mode main -ss %SS% -i %INPUT% -sn -map 0 -c:d copy -ignore_unknown -max_muxing_queue_size 1024 -f hls -hls_time 3 -hls_list_size 0 -hls_allow_cache 1 -hls_segment_filename %streamFileDir%/stream%streamNum%-%09d.ts -hls_flags delete_segments -c:a aac -ar 48000 -b:a 192k -ac 2 -c:v libx264 -flags +cgop -vf scale=-2:1080 -b:v 6000k -preset veryfast -flags +loop-global_header %OUTPUT%',
                    },
                    {
                        name: '720p',
                        cmd: '%FFMPEG% -dual_mono_mode main -ss %SS% -i %INPUT% -sn -map 0 -c:d copy -ignore_unknown -max_muxing_queue_size 1024 -f hls -hls_time 3 -hls_list_size 0 -hls_allow_cache 1 -hls_segment_filename %streamFileDir%/stream%streamNum%-%09d.ts -hls_flags delete_segments -c:a aac -ar 48000 -b:a 192k -ac 2 -c:v libx264 -flags +cgop -vf scale=-2:720 -b:v 3000k -preset veryfast -flags +loop-global_header %OUTPUT%',
                    },
                    {
                        name: '480p',
                        cmd: '%FFMPEG% -dual_mono_mode main -ss %SS% -i %INPUT% -sn -map 0 -c:d copy -ignore_unknown -max_muxing_queue_size 1024 -f hls -hls_time 3 -hls_list_size 0 -hls_allow_cache 1 -hls_segment_filename %streamFileDir%/stream%streamNum%-%09d.ts -hls_flags delete_segments -c:a aac -ar 48000 -b:a 128k -ac 2 -c:v libx264 -flags +cgop -vf scale=-2:480 -b:v 1500k -preset veryfast -flags +loop-global_header %OUTPUT%',
                    },
                ],
            },
        },
    };
}

export default Configuration;
