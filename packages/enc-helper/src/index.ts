import { spawn, execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import type { AudioStreamInfo, EncodeOptions, MediaInfo, ResolutionResult, VerificationResult } from './types.js';

export * from './types.js';

/**
 * ffprobe を用いてメディア情報（動画長、解像度、有効な音声ストリーム）を取得する
 */
export const getMediaInfo = (
    ffprobePath: string,
    filePath: string,
    analyzeduration: string = '10M',
    probesize: string = '32M',
): Promise<MediaInfo> => {
    return new Promise(resolve => {
        execFile(
            ffprobePath,
            [
                '-v',
                '0',
                '-analyzeduration',
                analyzeduration,
                '-probesize',
                probesize,
                '-show_format',
                '-show_streams',
                '-of',
                'json',
                '-i',
                filePath,
            ],
            (err, stdout) => {
                if (err) {
                    console.error('[enc_helper] ffprobe analysis failed, fallback to defaults:', err.message);
                    return resolve({
                        duration: 0,
                        width: 1920,
                        height: 1080,
                        audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
                    });
                }

                try {
                    const result = JSON.parse(stdout);
                    const duration = parseFloat(result.format?.duration || '0') || 0;
                    const videoStream = (result.streams || []).find(
                        (s: { codec_type?: string }) => s.codec_type === 'video',
                    );
                    const width = parseInt(videoStream?.width || '1920', 10);
                    const height = parseInt(videoStream?.height || '1080', 10);

                    const audioStreams: AudioStreamInfo[] = (result.streams || [])
                        .filter(
                            (s: { codec_type?: string; channels?: string | number }) =>
                                s.codec_type === 'audio' && parseInt(String(s.channels || '0'), 10) > 0,
                        )
                        .map((s: { channels?: string | number; sample_rate?: string | number }, idx: number) => ({
                            index: idx,
                            channels: parseInt(String(s.channels || '2'), 10),
                            sample_rate: parseInt(String(s.sample_rate || '48000'), 10),
                        }));

                    resolve({
                        duration,
                        width,
                        height,
                        audioStreams:
                            audioStreams.length > 0 ? audioStreams : [{ index: 0, channels: 2, sample_rate: 48000 }],
                    });
                } catch (e) {
                    console.error('[enc_helper] JSON parse error on ffprobe output:', e);
                    resolve({
                        duration: 0,
                        width: 1920,
                        height: 1080,
                        audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
                    });
                }
            },
        );
    });
};

/**
 * HH:MM:SS.ms 形式の文字列を秒数（float）に変換
 */
export const timeStrToSeconds = (timeStr?: string | null): number => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length === 3) {
        const hours = parseFloat(parts[0]) || 0;
        const minutes = parseFloat(parts[1]) || 0;
        const seconds = parseFloat(parts[2]) || 0;
        return hours * 3600 + minutes * 60 + seconds;
    }
    return parseFloat(timeStr) || 0;
};

/**
 * 解像度設定（scale / maxHeight）から W, H のターゲットサイズを算出
 */
export const resolveResolution = (
    scale?: string | number | null,
    maxHeight?: number | null,
    srcWidth: number = 1920,
    srcHeight: number = 1080,
    fix1440: boolean = false,
): ResolutionResult => {
    let targetW = srcWidth;
    let targetH = srcHeight;
    const is1440 = srcWidth === 1440 || (srcHeight === 1080 && srcWidth < 1920);

    if (typeof scale === 'string') {
        const s = scale.toLowerCase();
        if (s === '1080p' || s === 'fhd') {
            targetW = 1920;
            targetH = 1080;
        } else if (s === '720p' || s === 'hd') {
            targetW = 1280;
            targetH = 720;
        } else if (s === '540p' || s === 'qhd') {
            targetW = 960;
            targetH = 540;
        } else if (s === '480p' || s === 'sd') {
            targetW = 720;
            targetH = 480;
        } else if (s === 'native') {
            targetW = srcWidth;
            targetH = srcHeight;
        } else if (s.includes(':')) {
            const parts = s.split(':');
            targetW = parseInt(parts[0], 10) || srcWidth;
            targetH = parseInt(parts[1], 10) || srcHeight;
        }
    } else if (maxHeight && srcHeight > maxHeight) {
        targetH = maxHeight;
        // 縦解像度を変更する場合、地デジ 1440x1080 等の非正方形 16:9 映像は横解像度も正規 16:9 (正方形ピクセル) に自動調整
        const effectiveBaseWidth = is1440 ? Math.round((srcHeight * 16) / 9) : srcWidth;
        targetW = Math.round((effectiveBaseWidth * (maxHeight / srcHeight)) / 2) * 2;
    }

    // 地デジ 1440x1080 の 1920 拡大補正フラグ (スケーリングなしで 1080p を維持する場合)
    if (fix1440 && is1440 && targetH >= 1080) {
        targetW = 1920;
        targetH = 1080;
    }

    const isScaled = targetW !== srcWidth || targetH !== srcHeight;
    return { targetW, targetH, isScaled, is1440 };
};

/**
 * コーデック名・エイリアスを FFmpeg 正式エンコーダ名に正規化
 * - 'h265' / 'hevc' / 'x265' -> 'libx265'
 * - 'h264' / 'x264' -> 'libx264'
 * - 'h265_nvenc' / 'hevc_nvenc' / 'nvenc_hevc' / 'nvenc_h265' -> 'hevc_nvenc'
 * - 'h264_nvenc' / 'nvenc' / 'nvenc_h264' -> 'h264_nvenc'
 * - 'h265_vaapi' / 'hevc_vaapi' / 'vaapi_hevc' / 'vaapi_h265' -> 'hevc_vaapi'
 * - 'h264_vaapi' / 'vaapi' / 'vaapi_h264' -> 'h264_vaapi'
 * - 'h265_qsv' / 'hevc_qsv' / 'qsv_hevc' / 'qsv_h265' -> 'hevc_qsv'
 * - 'h264_qsv' / 'qsv' / 'qsv_h264' -> 'h264_qsv'
 */
export const normalizeCodec = (codec: string = 'libx264'): string => {
    const lower = codec.toLowerCase().trim();

    // NVENC
    if (lower.includes('nvenc')) {
        if (lower.includes('265') || lower.includes('hevc')) {
            return 'hevc_nvenc';
        }
        return 'h264_nvenc';
    }

    // VAAPI
    if (lower.includes('vaapi')) {
        if (lower.includes('265') || lower.includes('hevc')) {
            return 'hevc_vaapi';
        }
        return 'h264_vaapi';
    }

    // QSV
    if (lower.includes('qsv')) {
        if (lower.includes('265') || lower.includes('hevc')) {
            return 'hevc_qsv';
        }
        return 'h264_qsv';
    }

    // CPU / Generic aliases
    if (lower === 'h265' || lower === 'hevc' || lower === 'x265' || lower === 'libx265') {
        return 'libx265';
    }
    if (lower === 'h264' || lower === 'x264' || lower === 'libx264') {
        return 'libx264';
    }

    return codec;
};

/**
 * FFmpeg 引数を構築する
 */
export const buildFFmpegArgs = (options: EncodeOptions, mediaInfo: MediaInfo): string[] => {
    const input = process.env.INPUT;
    const output = process.env.OUTPUT;
    const envVideoHeight = parseInt(process.env.VIDEORESOLUTION || '', 10);
    const isDualMono = parseInt(process.env.AUDIOCOMPONENTTYPE || '', 10) === 2;

    const effectiveCodec = normalizeCodec(options.codec || 'libx264');
    const isVAAPI = effectiveCodec.includes('vaapi');
    const isQSV = effectiveCodec.includes('qsv');
    const isNVENC = effectiveCodec.includes('nvenc');
    const isHEVC = effectiveCodec.includes('hevc') || effectiveCodec.includes('265');

    const {
        preset = 'medium',
        tune = null,
        crf = 23,
        videoBitrate = null,
        maxrate = null,
        bufsize = null,
        scale = null,
        maxHeight = 1080,
        fix1440to1920 = isVAAPI ? true : false,
        deinterlace = true,
        dualMono = 'split',
        audioStreamMode = 'first',
        mainAudioBitrate = (envVideoHeight || mediaInfo.height) > 720 ? '192k' : '128k',
        secondaryAudioBitrate = '128k',
        faststart = true,
        analyzeduration = '10M',
        probesize = '32M',
        maxMuxingQueueSize = 1024,
        vaapiDevice = '/dev/dri/renderD128',
        customArgs = [],
        modifyArgs = null,
    } = options;

    let subtitle = typeof options.subtitle === 'boolean' ? options.subtitle : process.env.SUBTITLE === 'true';
    if (process.env.SUBTITLE === 'false') {
        subtitle = false;
    }

    const shouldCheckSuperimpose =
        options.skipSubtitleForSuperimpose || process.env.SKIP_SUBTITLE_FOR_SUPERIMPOSE === 'true';
    if (subtitle && shouldCheckSuperimpose) {
        const fullText = `${process.env.NAME || ''} ${process.env.DESCRIPTION || ''} ${process.env.EXTENDED || ''}`;
        if (fullText.includes('字幕スーパー')) {
            console.error('[enc_helper] Detected "字幕スーパー" in program info, skipping subtitle embedding');
            subtitle = false;
        }
    }

    const args: string[] = ['-y', '-analyzeduration', analyzeduration, '-probesize', probesize];

    // ARIB 字幕の無限 duration による MP4 muxer クラッシュ (error -22) を防止
    if (subtitle) {
        args.push('-fix_sub_duration');
    }

    if (isVAAPI) {
        args.push('-vaapi_device', vaapiDevice, '-hwaccel', 'vaapi', '-hwaccel_output_format', 'vaapi');
    }

    if (input) {
        args.push('-i', input);
    }

    if (faststart) {
        args.push('-movflags', 'faststart');
    }

    // 映像ストリームマップ
    args.push('-map', '0:v:0');
    args.push('-ignore_unknown', '-max_muxing_queue_size', String(maxMuxingQueueSize));

    // 字幕ストリーム設定 (ARIB STD-B24 -> MP4 mov_text)
    // 35分以上の長時間番組や疎な字幕での 32bit duration オーバーフロー (INT32_MAX > 2147秒) による MP4 muxer クラッシュ (error -22) を恒久防止
    if (subtitle) {
        args.push('-map', '0:s?', '-c:s', 'mov_text', '-time_base:s', '1/1000', '-metadata:s:s:0', 'language=jpn');
    } else {
        args.push('-sn');
    }

    // -------------------------------------------------------------
    // 音声ストリーム・フィルター処理
    // -------------------------------------------------------------
    const audioCodecArgs: string[] = [];

    if (isDualMono) {
        if (dualMono === 'main') {
            args.push(
                '-filter_complex',
                '[0:a:0]channelsplit=channel_layout=stereo:channels=FL[FL];[FL]aformat=channel_layouts=mono[aout]',
                '-map',
                '[aout]',
                '-metadata:s:a:0',
                'title=Main',
            );
            audioCodecArgs.push('-c:a:0', 'aac', '-b:a:0', mainAudioBitrate);
        } else if (dualMono === 'sub') {
            args.push(
                '-filter_complex',
                '[0:a:0]channelsplit=channel_layout=stereo:channels=FR[FR];[FR]aformat=channel_layouts=mono[aout]',
                '-map',
                '[aout]',
                '-metadata:s:a:0',
                'title=Sub',
            );
            audioCodecArgs.push('-c:a:0', 'aac', '-b:a:0', secondaryAudioBitrate);
        } else {
            args.push(
                '-filter_complex',
                '[0:a:0]channelsplit[FL_raw][FR_raw];[FL_raw]aformat=channel_layouts=mono[FL];[FR_raw]aformat=channel_layouts=mono[FR]',
                '-map',
                '[FL]',
                '-map',
                '[FR]',
                '-metadata:s:a:0',
                'title=Main',
                '-metadata:s:a:1',
                'title=Sub',
            );
            audioCodecArgs.push(
                '-c:a:0',
                'aac',
                '-b:a:0',
                mainAudioBitrate,
                '-c:a:1',
                'aac',
                '-b:a:1',
                secondaryAudioBitrate,
            );
        }
    } else {
        const streams = mediaInfo.audioStreams || [{ index: 0, channels: 2, sample_rate: 48000 }];
        if (audioStreamMode === 'first' || streams.length === 1) {
            args.push('-map', `0:a:${streams[0].index}`);
            audioCodecArgs.push('-c:a:0', 'aac', '-b:a:0', mainAudioBitrate);
        } else {
            streams.forEach((s, idx) => {
                args.push('-map', `0:a:${s.index}`);
                const bitrate = idx === 0 ? mainAudioBitrate : secondaryAudioBitrate;
                audioCodecArgs.push(`-c:a:${idx}`, 'aac', `-b:a:${idx}`, bitrate);
            });
        }
    }

    // -------------------------------------------------------------
    // 映像フィルター・解像度スケーリング処理
    // -------------------------------------------------------------
    const effectiveFix1440 = isVAAPI ? true : fix1440to1920;
    const res = resolveResolution(scale, maxHeight, mediaInfo.width, mediaInfo.height, effectiveFix1440);

    if (isVAAPI) {
        const filters: string[] = [];
        if (deinterlace) {
            filters.push('deinterlace_vaapi');
        }
        if (res.isScaled) {
            filters.push(`scale_vaapi=w=${res.targetW}:h=${res.targetH},setsar=1/1`);
        }
        if (filters.length > 0) {
            args.push('-vf', filters.join(','));
        }
    } else {
        const filters: string[] = [];
        if (deinterlace) {
            filters.push('yadif');
        }
        if (res.isScaled) {
            filters.push(`scale=${res.targetW}:${res.targetH},setsar=1/1`);
        } else if (res.is1440) {
            filters.push('setsar=4/3');
        }
        if (filters.length > 0) {
            args.push('-vf', filters.join(','));
        }
    }

    // -------------------------------------------------------------
    // エンコーダ & 出力オプション
    // -------------------------------------------------------------
    args.push('-aspect', '16:9', '-c:v', effectiveCodec);

    if (isVAAPI) {
        const defaultBitrate = isHEVC
            ? res.targetH <= 720
                ? '1800k'
                : '3000k'
            : res.targetH <= 720
              ? '2500k'
              : '4500k';
        args.push('-b:v', videoBitrate || defaultBitrate);
    } else if (isNVENC) {
        if (preset) args.push('-preset', preset);
        if (videoBitrate) {
            args.push('-b:v', videoBitrate);
        } else if (crf !== null && crf !== undefined) {
            args.push('-cq', String(crf));
        }
    } else if (isQSV) {
        if (preset) args.push('-preset', preset);
        if (videoBitrate) {
            args.push('-b:v', videoBitrate);
        } else if (crf !== null && crf !== undefined) {
            args.push('-global_quality', String(crf));
        }
    } else {
        if (preset) args.push('-preset', preset);
        if (tune) args.push('-tune', tune);
        if (videoBitrate) {
            args.push('-b:v', videoBitrate);
        } else if (crf !== null && crf !== undefined) {
            args.push('-crf', String(crf));
        }
    }

    // VBV バッファ制御
    if (maxrate) {
        args.push('-maxrate', maxrate);
        let effectiveBufsize = bufsize;
        if (!effectiveBufsize) {
            const match = String(maxrate).match(/^(\d+)(k|m)?$/i);
            if (match) {
                const val = parseInt(match[1], 10);
                const unit = match[2] || 'k';
                effectiveBufsize = `${val * 2}${unit}`;
            }
        }
        if (effectiveBufsize) {
            args.push('-bufsize', effectiveBufsize);
        }
    } else if (bufsize) {
        args.push('-bufsize', bufsize);
    }

    // 音声共通オプション
    args.push(...audioCodecArgs, '-ar', '48000', '-ac', '2', '-f', 'mp4');

    if (Array.isArray(customArgs) && customArgs.length > 0) {
        args.push(...customArgs);
    }

    if (output) {
        args.push(output);
    }

    if (typeof modifyArgs === 'function') {
        return modifyArgs(args);
    }

    return args;
};

/**
 * 出力ファイルの整合性（動画長・破損）を検証する
 */
export const verifyOutputFile = (
    ffprobePath: string,
    inputDuration: number,
    outputFilePath: string,
    options: Pick<EncodeOptions, 'verifyDuration' | 'minDurationRatio' | 'minDurationSeconds'> = {},
): Promise<VerificationResult> => {
    const { verifyDuration = true, minDurationRatio = 0.8, minDurationSeconds = 5 } = options;

    if (!verifyDuration || inputDuration <= 0) {
        return Promise.resolve({ valid: true });
    }

    return new Promise(resolve => {
        execFile(ffprobePath, ['-v', '0', '-show_format', '-of', 'json', outputFilePath], (err, stdout) => {
            if (err) {
                return resolve({
                    valid: false,
                    reason: `Cannot probe output file (${err.message})`,
                });
            }

            try {
                const result = JSON.parse(stdout);
                const outputDuration = parseFloat(result.format?.duration || '0') || 0;

                if (outputDuration < minDurationSeconds) {
                    return resolve({
                        valid: false,
                        reason: `Output duration is too short (${outputDuration.toFixed(1)}s < ${minDurationSeconds}s)`,
                    });
                }

                const ratio = outputDuration / inputDuration;
                if (ratio < minDurationRatio) {
                    return resolve({
                        valid: false,
                        reason: `Output duration ratio is too low (${(ratio * 100).toFixed(1)}% < ${(minDurationRatio * 100).toFixed(0)}%, Input: ${inputDuration.toFixed(1)}s, Output: ${outputDuration.toFixed(1)}s)`,
                    });
                }

                resolve({ valid: true, outputDuration });
            } catch (e) {
                resolve({
                    valid: false,
                    reason: `JSON parse error on output ffprobe (${(e as Error).message})`,
                });
            }
        });
    });
};

/**
 * コマンドと引数の配列をシェル実行可能な文字列にフォーマット
 */
export const formatCommand = (bin: string, cmdArgs: string[]): string => {
    return [
        bin,
        ...cmdArgs.map(arg => {
            if (/[\s"'\\$`*?~<>|&;()[\]{}]/.test(arg)) {
                return `"${arg.replace(/(["\\$`])/g, '\\$1')}"`;
            }
            return arg;
        }),
    ].join(' ');
};

/**
 * エンコードを実行するメイン関数
 */
export async function runEncode(options: EncodeOptions = {}): Promise<void> {
    const ffmpeg = process.env.FFMPEG || '/usr/bin/ffmpeg';
    const ffprobe = process.env.FFPROBE || '/usr/bin/ffprobe';
    const input = process.env.INPUT;
    const output = process.env.OUTPUT;

    if (!input || !output) {
        console.error('[enc_helper] Error: INPUT or OUTPUT environment variable is not defined.');
        process.exit(1);
    }

    const analyzeduration = options.analyzeduration || '10M';
    const probesize = options.probesize || '32M';

    // 1. メディア情報解析
    const mediaInfo = await getMediaInfo(ffprobe, input, analyzeduration, probesize);

    // 2. 引数構築
    const args = buildFFmpegArgs(options, mediaInfo);

    console.error('[enc_helper] FFmpeg command: ' + formatCommand(ffmpeg, args));

    // 3. プロセス実行
    let child: ReturnType<typeof spawn> | null = null;

    process.on('SIGINT', () => {
        if (child) child.kill('SIGINT');
        process.exitCode = 1;
    });

    process.on('SIGTERM', () => {
        if (child) child.kill('SIGTERM');
        process.exitCode = 1;
    });

    child = spawn(ffmpeg, args);

    const timeRegExp = /time=\s*(?<time>\d+[:\.\d+]*)/;

    child.stderr?.on('data', (data: Buffer | string) => {
        const text = String(data);
        console.error(text);

        if (mediaInfo.duration > 0) {
            const match = text.match(timeRegExp);
            if (match && match.groups && match.groups.time) {
                const currentTime = timeStrToSeconds(match.groups.time);
                const percent = Math.min(100, Math.max(0, (currentTime / mediaInfo.duration) * 100));
                const progressJson = JSON.stringify({
                    type: 'progress',
                    percent: parseFloat(percent.toFixed(2)),
                    log: text.trim(),
                });
                console.log(progressJson);
            }
        }
    });

    child.on('error', (err: Error) => {
        console.error('[enc_helper] Process error:', err);
        throw err;
    });

    child.on('close', async (code: number | null) => {
        if (code !== 0) {
            console.error(`[enc_helper] FFmpeg failed with exit code ${code}`);
            process.exitCode = code || 1;
            return;
        }

        // 4. 出力ファイルの整合性・動画長検証
        try {
            const check = await verifyOutputFile(ffprobe, mediaInfo.duration, output, options);
            if (!check.valid) {
                console.error(`[enc_helper] CRITICAL ERROR: Corrupted output detected! ${check.reason}`);
                console.error('[enc_helper] Aborting with exit code 1 to protect source TS from deletion.');
                process.exit(1);
            }

            console.error(
                `[enc_helper] Encode completed successfully. (Duration: ${check.outputDuration?.toFixed(1) || 'OK'}s)`,
            );
            process.exit(0);
        } catch (e) {
            console.error('[enc_helper] Verification exception:', e);
            console.error('[enc_helper] Aborting with exit code 1 to protect source TS from deletion.');
            process.exit(1);
        }
    });
}

/**
 * CLI コマンドライン引数をパースして EncodeOptions を構築
 */
export const parseCliArgs = (args: string[]): EncodeOptions => {
    const cliOptions: EncodeOptions = {};
    let isHw = false;
    let hwType = '';
    let isHevc = false;
    let explicitCodec: string | null = null;

    for (const arg of args) {
        const lower = arg.toLowerCase().trim();
        if (lower === '1080p' || lower === '720p' || lower === '540p' || lower === '480p') {
            cliOptions.scale = lower;
        } else if (lower.includes('vaapi')) {
            isHw = true;
            hwType = 'vaapi';
            if (lower.includes('265') || lower.includes('hevc')) {
                isHevc = true;
            }
        } else if (lower.includes('qsv')) {
            isHw = true;
            hwType = 'qsv';
            if (lower.includes('265') || lower.includes('hevc')) {
                isHevc = true;
            }
        } else if (lower.includes('nvenc')) {
            isHw = true;
            hwType = 'nvenc';
            if (lower.includes('265') || lower.includes('hevc')) {
                isHevc = true;
            }
        } else if (lower === 'hevc' || lower === 'h265' || lower === 'x265') {
            isHevc = true;
        } else if (lower === 'h264' || lower === 'x264') {
            isHevc = false;
        } else if (
            lower.startsWith('libx') ||
            lower.startsWith('hevc_') ||
            lower.startsWith('h264_') ||
            lower.startsWith('h265_')
        ) {
            explicitCodec = lower;
        }
    }

    if (explicitCodec) {
        cliOptions.codec = normalizeCodec(explicitCodec);
    } else if (isHw) {
        cliOptions.codec = `${isHevc ? 'hevc' : 'h264'}_${hwType}`;
    } else if (isHevc) {
        cliOptions.codec = 'libx265';
    }

    return cliOptions;
};

/**
 * CLI 実行ハンドラー (node enc_helper.js [resolution/preset] [codec])
 */
export async function runCli(args: string[]): Promise<void> {
    const cliOptions = parseCliArgs(args);

    try {
        await runEncode(cliOptions);
    } catch (err) {
        console.error('[enc_helper] Top-level error:', err);
        process.exit(1);
    }
}

// CLI エントリポイント判定
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runCli(process.argv.slice(2)).catch(err => {
        console.error('[enc_helper] Top-level error:', err);
        process.exit(1);
    });
}
