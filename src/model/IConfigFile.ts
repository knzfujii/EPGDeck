import * as apid from '../../api';
import * as Enums from '../Enums';

export interface HttpsConfig {
    port: number;
    key: string; // 秘密鍵
    cert: string; // 証明書
    ca?: string | string[]; // クライアント認証用
}

export interface RecordedDirInfo {
    name: string;
    path: string;
    limitThreshold?: number; // 空き容量限界閾値 (MB)
    action?: 'remove' | 'none'; // 空き容量限界値を超えたときの動作
    limitCmd?: string; // 空き容量限界値を超えたときに実行するコマンド
}

export interface URLSchemeInfo {
    ios?: string;
    android?: string;
    mac?: string;
    win?: string;
}

export interface StreamingCmd {
    name: string;
    cmd?: string;
}

export interface KodiInfo {
    name: string;
    host: string;
    user?: string;
    password?: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFileConfig {
    enabled?: boolean;
    path?: string;
    maxSize?: number;
    backups?: number;
}

export interface LogConfig {
    level?: LogLevel;
    console?: boolean;
    file?: LogFileConfig;
    bufferSize?: number;
}

export interface ServerConfig {
    port?: number;
    mirakurun: string;
    subDirectory?: string;
    https?: HttpsConfig;
    uid?: number | string;
    gid?: number | string;
    apiServers?: string[];
    isAllowAllCORS?: boolean;
}

export interface DatabaseConfig {
    type: Enums.DBType;
    sqlite?: {
        extensions?: string[];
        regexp?: boolean;
    };
    mysql?: {
        host: string;
        user: string;
        port: number;
        password: string;
        database: string;
        charset?: string;
    };
    postgres?: {
        host: string;
        user: string;
        port: number;
        database: string;
        password: string;
    };
}

export interface EPGConfig {
    intervalMinutes: number;
    replaceEnclosingCharacters: boolean;
    channelOrder?: apid.ChannelId[];
    sidOrder?: apid.ServiceId[];
    excludeChannels?: apid.ChannelId[];
    excludeSids?: apid.ServiceId[];
}

export interface RecordingPriorityConfig {
    conflict: number;
    recording: number;
    streaming: number;
}

export interface ThumbnailConfig {
    path: string;
    cmd?: string;
    size: string;
    positionSeconds: number;
}

export interface DropLogConfig {
    path: string;
    enabled: boolean;
}

export interface RecordingConfig {
    filenameFormat: string;
    fileExtension: string;
    directories: RecordedDirInfo[];
    tempDir?: string;
    historyRetentionDays: number;
    storageCheckIntervalSeconds: number;
    priority: RecordingPriorityConfig;
    timeSpecifiedStartMargin: number;
    timeSpecifiedEndMargin: number;
    thumbnail: ThumbnailConfig;
    dropLog: DropLogConfig;
    uploadTempDir: string;
}

export interface EncodeBinariesConfig {
    ffmpeg: string;
    ffprobe: string;
}

export interface EncodePresetConfig {
    name: string;
    script?: string;
    cmd: string;
    suffix?: string;
    rate?: number;
    subtitle?: boolean;
}

export interface EncodeConfig {
    binaries: EncodeBinariesConfig;
    maxProcesses: number;
    concurrency: number;
    presets: EncodePresetConfig[];
}

export interface HookCommandsConfig {
    reserveNewAddition?: string;
    reserveUpdate?: string;
    reserveDeleted?: string;
    recordingPreStart?: string;
    recordingPrepRecFailed?: string;
    recordingStart?: string;
    recordingFinish?: string;
    recordingFailed?: string;
    encodingFinish?: string;
    isSuppressReservesUpdateAllLog?: boolean;
}

export interface URLSchemeConfig {
    m2ts: URLSchemeInfo;
    video: URLSchemeInfo;
    download: URLSchemeInfo;
}

export interface StreamingConfig {
    tempDir?: string;
    live?: {
        ts?: {
            m2ts?: StreamingCmd[];
            m2tsll?: StreamingCmd[];
            webm?: StreamingCmd[];
            mp4?: StreamingCmd[];
            hls?: StreamingCmd[];
        };
    };
    recorded?: {
        ts?: {
            webm?: StreamingCmd[];
            mp4?: StreamingCmd[];
            hls?: StreamingCmd[];
        };
        encoded?: {
            webm?: StreamingCmd[];
            mp4?: StreamingCmd[];
            hls?: StreamingCmd[];
        };
    };
}

/**
 * 新 EPGDeck 構造化 config ファイル形式
 */
export default interface IConfigFile {
    server: ServerConfig;
    database: DatabaseConfig;
    log?: LogConfig;
    epg: EPGConfig;
    recording: RecordingConfig;
    encode: EncodeConfig;
    hooks?: HookCommandsConfig;
    urlscheme?: URLSchemeConfig;
    streaming?: StreamingConfig;
    kodi?: KodiInfo[];
}
