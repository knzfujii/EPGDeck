import type * as apid from '../../../../api';

/**
 * 動画ファイルがブラウザ直接再生可能な MP4 / エンコード済みファイルであるかを判定
 */
export function isMp4VideoFile(
    file:
        | {
              filename?: string;
              name?: string;
              type?: string;
          }
        | null
        | undefined,
): boolean {
    if (!file) return false;

    // 拡張子または名前に .mp4 / mp4 が含まれる場合
    if (file.filename && file.filename.toLowerCase().endsWith('.mp4')) {
        return true;
    }
    if (file.name && file.name.toLowerCase().includes('mp4')) {
        return true;
    }

    // type が encoded で TS 形式でない場合
    if (file.type === 'encoded') {
        if (
            file.filename &&
            (file.filename.toLowerCase().endsWith('.ts') || file.filename.toLowerCase().endsWith('.m2ts'))
        ) {
            return false;
        }
        return true;
    }

    return false;
}

/**
 * 動画ファイル配列から先頭（最上位）の MP4 / 直接再生可能ファイルを取得
 */
export function getTopMp4File(files: apid.VideoFile[] | undefined | null): apid.VideoFile | null {
    if (!files || files.length === 0) return null;
    return files.find(f => isMp4VideoFile(f)) || null;
}

export interface WatchUrlParams {
    recordedId: number;
    videoId?: number | null;
    videoFileId?: number | null;
    type?: string | null;
    mode?: number | null;
}

/**
 * 録画再生画面（/recorded/watch）への URL を生成
 */
export function getWatchUrl(params: WatchUrlParams): string {
    const searchParams = new URLSearchParams();
    searchParams.set('recordedId', String(params.recordedId));

    if (params.videoId != null) {
        searchParams.set('videoId', String(params.videoId));
    }
    if (params.videoFileId != null) {
        searchParams.set('videoFileId', String(params.videoFileId));
    }
    if (params.type) {
        searchParams.set('type', params.type);
    }
    if (params.mode != null) {
        searchParams.set('mode', String(params.mode));
    }

    return `/recorded/watch?${searchParams.toString()}`;
}

/**
 * 最上位の MP4 が存在する場合に直接再生用 URL を返す。
 * MP4 が存在しない場合は null を返し、呼び出し側でモーダル表示などのフォールバックを行う。
 */
export function getSmartWatchUrl(recordedId: number, videoFiles?: apid.VideoFile[] | null): string | null {
    const topMp4 = getTopMp4File(videoFiles);
    if (topMp4) {
        return getWatchUrl({ recordedId, videoId: topMp4.id });
    }
    return null;
}

/**
 * 録画番組に紐づくすべての動画ファイル（TSやエンコード済み等）の合計サイズ（バイト数）を取得
 */
export function getTotalVideoFileSize(videoFiles?: apid.VideoFile[] | null): number {
    if (!videoFiles || videoFiles.length === 0) return 0;
    return videoFiles.reduce((acc, file) => acc + (file.size || 0), 0);
}

export type PlaybackStreamType = 'direct' | 'm2tsll' | 'webm' | 'hls';

export interface PlaybackPreference {
    streamType: PlaybackStreamType;
    mode: number;
}

export type PlaybackTarget = 'live' | 'recorded_mp4' | 'recorded_ts';

export const PREF_KEY_PREFIX = 'epgdeck_playback_pref_';

const VALID_STREAM_TYPES: PlaybackStreamType[] = ['direct', 'm2tsll', 'webm', 'hls'];

/**
 * 視聴設定（プロトコル & モード）を LocalStorage から取得。未保存時は安全なデフォルト値を返却。
 */
export function getPlaybackPreference(target: PlaybackTarget): PlaybackPreference {
    const defaults: Record<PlaybackTarget, PlaybackPreference> = {
        live: { streamType: 'm2tsll', mode: 0 },
        recorded_mp4: { streamType: 'direct', mode: 0 },
        recorded_ts: { streamType: 'hls', mode: 0 },
    };

    if (typeof window === 'undefined' || !window.localStorage) {
        return defaults[target];
    }

    try {
        const raw = localStorage.getItem(PREF_KEY_PREFIX + target);
        if (!raw) return defaults[target];
        const parsed = JSON.parse(raw);
        if (
            parsed &&
            typeof parsed.streamType === 'string' &&
            VALID_STREAM_TYPES.includes(parsed.streamType) &&
            typeof parsed.mode === 'number' &&
            !isNaN(parsed.mode) &&
            parsed.mode >= 0
        ) {
            return {
                streamType: parsed.streamType,
                mode: parsed.mode,
            };
        }
    } catch {
        // ignore parse error
    }
    return defaults[target];
}

/**
 * 視聴設定（プロトコル & モード）を LocalStorage に保存
 */
export function savePlaybackPreference(target: PlaybackTarget, pref: PlaybackPreference): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
        localStorage.setItem(PREF_KEY_PREFIX + target, JSON.stringify(pref));
    } catch {
        // ignore
    }
}

export interface ProtocolOption {
    type: PlaybackStreamType;
    label: string;
    badge?: string;
    subText: string;
    isAvailable: boolean;
}

export interface ProtocolOptionParams {
    channelId?: number | null;
    recordedId?: number | null;
    isCurrentFileMp4: boolean;
    hasSelectedFile: boolean;
    canLiveStream: boolean;
    canRecordedStream: boolean;
}

/**
 * プロトコル一覧（直接再生, M2TS-LL, WebM, HLS）の表示設定と利用可否を取得
 */
export function getProtocolOptions(params: ProtocolOptionParams): ProtocolOption[] {
    const { channelId, recordedId, isCurrentFileMp4, hasSelectedFile, canLiveStream, canRecordedStream } = params;

    // 1. 直接再生 (MP4)
    const isDirectAvail = !!recordedId && hasSelectedFile && isCurrentFileMp4;
    let directSub = '即時再生';
    if (channelId) {
        directSub = 'オンエアー非対応';
    } else if (!isCurrentFileMp4) {
        directSub = 'MP4のみ';
    }

    // 2. M2TS-LL
    const isM2tsllAvail = !!channelId && canLiveStream;
    let m2tsllSub = '低遅延 (1-2秒)';
    if (recordedId) {
        m2tsllSub = 'オンエアー専用';
    } else if (!canLiveStream) {
        m2tsllSub = '🔒 制限中';
    }

    // 3. WebM
    let isWebmAvail = false;
    let webmSub = '低負荷 (3-5秒)';
    if (channelId) {
        isWebmAvail = canLiveStream;
        if (!canLiveStream) webmSub = '🔒 制限中';
    } else if (recordedId) {
        isWebmAvail = canRecordedStream && hasSelectedFile;
        webmSub = canRecordedStream ? '高速トランスコード' : '🔒 制限中';
    }

    // 4. HLS
    let isHlsAvail = false;
    let hlsSub = '高互換・iOS';
    if (channelId) {
        isHlsAvail = canLiveStream;
        if (!canLiveStream) hlsSub = '🔒 制限中';
    } else if (recordedId) {
        isHlsAvail = canRecordedStream && hasSelectedFile;
        hlsSub = canRecordedStream ? '高互換・シーク可' : '🔒 制限中';
    }

    return [
        {
            type: 'direct',
            label: '直接再生',
            badge: 'MP4',
            subText: directSub,
            isAvailable: isDirectAvail,
        },
        {
            type: 'm2tsll',
            label: 'M2TS-LL',
            subText: m2tsllSub,
            isAvailable: isM2tsllAvail,
        },
        {
            type: 'webm',
            label: 'WebM',
            badge: '字幕非対応',
            subText: webmSub,
            isAvailable: isWebmAvail,
        },
        {
            type: 'hls',
            label: 'HLS',
            subText: hlsSub,
            isAvailable: isHlsAvail,
        },
    ];
}

export interface StreamModeItem {
    id: number;
    label: string;
    desc: string;
    numericRes: number;
}

/**
 * 画質名文字列（例: "1080p", "720p", "無変換"）から解像度数値を抽出
 */
export function parseStreamResolution(name: string): number {
    const match = name.match(/(\d+)p/i);
    if (match) return parseInt(match[1], 10);
    if (name.includes('無変換') || name.toLowerCase().includes('original')) return 9999;
    return 0;
}

/**
 * 画質名と解像度に応じたユーザー向け説明文を生成
 */
export function getStreamModeDescription(name: string, resolution: number): string {
    if (name.includes('無変換') || name.toLowerCase().includes('original')) return '元画質・無劣化';
    if (resolution >= 1080) return '最高画質';
    if (resolution >= 720) return '高画質・標準';
    if (resolution > 0) return '中画質・節約';
    return 'カスタム';
}

export interface AvailableStreamModesParams {
    streamType: PlaybackStreamType;
    channelId?: number | null;
    recordedId?: number | null;
    isEncoded?: boolean;
    streamConfig?: apid.Config['streamConfig'];
}

/**
 * サーバー設定から利用可能な画質モード一覧を取得し、解像度降順（1080p > 720p > ...）でソートして返却
 */
export function getAvailableStreamModes(params: AvailableStreamModesParams): StreamModeItem[] {
    const { streamType, channelId, recordedId, isEncoded, streamConfig } = params;
    if (streamType === 'direct') return [];

    let modeNames: string[] = [];

    if (channelId) {
        const liveTs = streamConfig?.live?.ts;
        if (liveTs) {
            if (streamType === 'm2tsll') modeNames = liveTs.m2tsll || [];
            else if (streamType === 'webm') modeNames = liveTs.webm || [];
            else if (streamType === 'hls') modeNames = liveTs.hls || [];
        }
    } else if (recordedId) {
        const recConfig = isEncoded ? streamConfig?.recorded?.encoded : streamConfig?.recorded?.ts;
        if (recConfig) {
            if (streamType === 'webm') modeNames = recConfig.webm || [];
            else if (streamType === 'hls') modeNames = recConfig.hls || [];
        }
    }

    if (!modeNames || modeNames.length === 0) {
        modeNames = ['720p', '480p'];
    }

    const list: StreamModeItem[] = modeNames.map((name, index) => {
        const res = parseStreamResolution(name);
        return {
            id: index,
            label: name,
            desc: getStreamModeDescription(name, res),
            numericRes: res,
        };
    });

    return list.slice().sort((a, b) => {
        if (b.numericRes !== a.numericRes) {
            return b.numericRes - a.numericRes;
        }
        return a.id - b.id;
    });
}
