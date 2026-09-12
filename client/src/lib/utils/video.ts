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
