const { spawn, execFile } = require('child_process');

/**
 * ffprobe を用いてメディア情報（動画長、解像度、有効な音声ストリーム）を取得する
 */
const getMediaInfo = (ffprobePath, filePath, analyzeduration, probesize) => {
    return new Promise((resolve) => {
        execFile(
            ffprobePath,
            [
                '-v', '0',
                '-analyzeduration', analyzeduration,
                '-probesize', probesize,
                '-show_format',
                '-show_streams',
                '-of', 'json',
                '-i', filePath,
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
                    const videoStream = (result.streams || []).find((s) => s.codec_type === 'video');
                    const width = parseInt(videoStream?.width || '1920', 10);
                    const height = parseInt(videoStream?.height || '1080', 10);

                    const audioStreams = (result.streams || [])
                        .filter((s) => s.codec_type === 'audio' && parseInt(s.channels || '0', 10) > 0)
                        .map((s, idx) => ({
                            index: idx,
                            channels: parseInt(s.channels || '2', 10),
                            sample_rate: parseInt(s.sample_rate || '48000', 10),
                        }));

                    resolve({
                        duration,
                        width,
                        height,
                        audioStreams: audioStreams.length > 0 ? audioStreams : [{ index: 0, channels: 2, sample_rate: 48000 }],
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
const timeStrToSeconds = (timeStr) => {
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
 * @param {string|number|null} scale '1080p'|'720p'|'540p'|'480p'|'native'|'W:H'
 * @param {number|null} maxHeight
 * @param {number} srcWidth
 * @param {number} srcHeight
 * @param {boolean} fix1440
 */
const resolveResolution = (scale, maxHeight, srcWidth, srcHeight, fix1440) => {
    let targetW = srcWidth;
    let targetH = srcHeight;

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
        targetW = Math.round((srcWidth * (maxHeight / srcHeight)) / 2) * 2;
    }

    // 地デジ 1440x1080 の 1920 拡大補正フラグ
    const is1440 = srcWidth === 1440 || (srcHeight === 1080 && srcWidth < 1920);
    if (fix1440 && is1440 && targetH >= 1080) {
        targetW = 1920;
        targetH = 1080;
    }

    const isScaled = targetW !== srcWidth || targetH !== srcHeight;
    return { targetW, targetH, isScaled, is1440 };
};

/**
 * FFmpeg 引数を構築する
 */
const buildFFmpegArgs = (options, mediaInfo) => {
    const input = process.env.INPUT;
    const output = process.env.OUTPUT;
    const envVideoHeight = parseInt(process.env.VIDEORESOLUTION, 10);
    const isDualMono = parseInt(process.env.AUDIOCOMPONENTTYPE, 10) === 2;

    const isVAAPI = (options.codec || '').includes('vaapi');
    const isQSV = (options.codec || '').includes('qsv');
    const isNVENC = (options.codec || '').includes('nvenc');

    const {
        codec = 'libx264',
        preset = 'medium',
        crf = 23,
        videoBitrate = null,
        scale = null, // '1080p' | '720p' | '540p' | '480p' | 'native' | 'W:H'
        maxHeight = 1080,
        // fix1440to1920: デフォルト false (VAAPI は自動で true)
        fix1440to1920 = isVAAPI ? true : false,
        deinterlace = true,
        dualMono = 'split', // 'split' | 'main' | 'sub'
        audioStreamMode = 'first', // 'first' (第1トラックのみ・標準) | 'all' (全トラック保持)
        mainAudioBitrate = (envVideoHeight || mediaInfo.height) > 720 ? '192k' : '128k',
        secondaryAudioBitrate = '128k',
        subtitle = typeof options.subtitle === 'boolean' ? options.subtitle : process.env.SUBTITLE === 'true',
        faststart = true,
        analyzeduration = '10M',
        probesize = '32M',
        maxMuxingQueueSize = 1024,
        vaapiDevice = '/dev/dri/renderD128',
        customArgs = [],
        modifyArgs = null,
    } = options;

    const args = ['-y', '-analyzeduration', analyzeduration, '-probesize', probesize];

    // ARIB 字幕の無限 duration による MP4 muxer クラッシュ (error -22) を防止
    if (subtitle) {
        args.push('-fix_sub_duration');
    }

    if (isVAAPI) {
        args.push('-vaapi_device', vaapiDevice, '-hwaccel', 'vaapi', '-hwaccel_output_format', 'vaapi');
    }

    args.push('-i', input);

    if (faststart) {
        args.push('-movflags', 'faststart');
    }

    // 映像ストリームマップ
    args.push('-map', '0:v:0');
    args.push('-ignore_unknown', '-max_muxing_queue_size', String(maxMuxingQueueSize));

    // 字幕ストリーム設定 (ARIB STD-B24 -> MP4 mov_text)
    if (subtitle) {
        args.push('-map', '0:s?', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=jpn');
    } else {
        args.push('-sn');
    }

    // -------------------------------------------------------------
    // 音声ストリーム・フィルター処理
    // -------------------------------------------------------------
    const audioCodecArgs = [];

    if (isDualMono) {
        if (dualMono === 'main') {
            // 主音声のみ抽出
            args.push(
                '-filter_complex', '[0:a:0]channelsplit=channel_layout=stereo:channels=FL[FL];[FL]aformat=channel_layouts=mono[aout]',
                '-map', '[aout]',
                '-metadata:s:a:0', 'title=Main',
            );
            audioCodecArgs.push('-c:a:0', 'aac', '-b:a:0', mainAudioBitrate);
        } else if (dualMono === 'sub') {
            // 副音声のみ抽出
            args.push(
                '-filter_complex', '[0:a:0]channelsplit=channel_layout=stereo:channels=FR[FR];[FR]aformat=channel_layouts=mono[aout]',
                '-map', '[aout]',
                '-metadata:s:a:0', 'title=Sub',
            );
            audioCodecArgs.push('-c:a:0', 'aac', '-b:a:0', secondaryAudioBitrate);
        } else {
            // 2トラック分離 (Main / Sub)
            args.push(
                '-filter_complex', '[0:a:0]channelsplit[FL_raw][FR_raw];[FL_raw]aformat=channel_layouts=mono[FL];[FR_raw]aformat=channel_layouts=mono[FR]',
                '-map', '[FL]',
                '-map', '[FR]',
                '-metadata:s:a:0', 'title=Main',
                '-metadata:s:a:1', 'title=Sub',
            );
            audioCodecArgs.push(
                '-c:a:0', 'aac', '-b:a:0', mainAudioBitrate,
                '-c:a:1', 'aac', '-b:a:1', secondaryAudioBitrate,
            );
        }
    } else {
        // 通常音声 (マルチオーディオ対応)
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
        const filters = [];
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
        const filters = [];
        if (deinterlace) {
            filters.push('yadif');
        }
        if (res.isScaled) {
            filters.push(`scale=${res.targetW}:${res.targetH},setsar=1/1`);
        }
        if (filters.length > 0) {
            args.push('-vf', filters.join(','));
        }
    }

    // -------------------------------------------------------------
    // エンコーダ & 出力オプション
    // -------------------------------------------------------------
    args.push('-aspect', '16:9', '-c:v', codec);

    if (isVAAPI) {
        args.push('-b:v', videoBitrate || (res.targetH <= 720 ? '2500k' : '4500k'));
    } else if (isNVENC) {
        if (preset) args.push('-preset', preset);
        if (crf !== null) args.push('-cq', String(crf));
        if (videoBitrate) args.push('-b:v', videoBitrate);
    } else if (isQSV) {
        if (preset) args.push('-preset', preset);
        if (crf !== null) args.push('-global_quality', String(crf));
        if (videoBitrate) args.push('-b:v', videoBitrate);
    } else {
        // CPU
        if (preset) args.push('-preset', preset);
        if (crf !== null) args.push('-crf', String(crf));
        if (videoBitrate) args.push('-b:v', videoBitrate);
    }

    // 音声共通オプション
    args.push(...audioCodecArgs, '-ar', '48000', '-ac', '2', '-f', 'mp4');

    if (Array.isArray(customArgs) && customArgs.length > 0) {
        args.push(...customArgs);
    }

    args.push(output);

    if (typeof modifyArgs === 'function') {
        return modifyArgs(args);
    }

    return args;
};

/**
 * 出力ファイルの整合性（動画長・破損）を検証する
 */
const verifyOutputFile = (ffprobePath, inputDuration, outputFilePath, options) => {
    const {
        verifyDuration = true,
        minDurationRatio = 0.8, // 入力動画長の 80% 未満なら異常と判定
        minDurationSeconds = 5,
    } = options;

    if (!verifyDuration || inputDuration <= 0) {
        return Promise.resolve({ valid: true });
    }

    return new Promise((resolve) => {
        execFile(
            ffprobePath,
            [
                '-v', '0',
                '-show_format',
                '-of', 'json',
                outputFilePath,
            ],
            (err, stdout) => {
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
                        reason: `JSON parse error on output ffprobe (${e.message})`,
                    });
                }
            },
        );
    });
};

/**
 * エンコードを実行するメイン関数
 * @param {Object} options エンコード設定オプション
 */
async function runEncode(options = {}) {
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

    console.error('[enc_helper] FFmpeg command:', ffmpeg, args.join(' '));

    // 3. プロセス実行
    let child = null;

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

    child.stderr.on('data', (data) => {
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

    child.on('error', (err) => {
        console.error('[enc_helper] Process error:', err);
        throw err;
    });

    child.on('close', async (code) => {
        if (code !== 0) {
            console.error(`[enc_helper] FFmpeg failed with exit code ${code}`);
            process.exitCode = code;
            return;
        }

        // 4. 出力ファイルの整合性・動画長検証 (ドロップによる短小破損ブロック)
        try {
            const check = await verifyOutputFile(ffprobe, mediaInfo.duration, output, options);
            if (!check.valid) {
                console.error(`[enc_helper] CRITICAL ERROR: Corrupted output detected! ${check.reason}`);
                console.error('[enc_helper] Aborting with exit code 1 to protect source TS from deletion.');
                process.exit(1);
            }

            console.error(`[enc_helper] Encode completed successfully. (Duration: ${check.outputDuration?.toFixed(1) || 'OK'}s)`);
            process.exit(0);
        } catch (e) {
            console.error('[enc_helper] Verification exception:', e);
            console.error('[enc_helper] Aborting with exit code 1 to protect source TS from deletion.');
            process.exit(1);
        }
    });
}

// CLI エントリポイント (node enc_helper.js [resolution/preset] [codec])
if (require.main === module) {
    const rawArgs = process.argv.slice(2);
    const cliOptions = {};

    for (const arg of rawArgs) {
        const lower = arg.toLowerCase();
        if (lower === '1080p' || lower === '720p' || lower === '540p' || lower === '480p') {
            cliOptions.scale = lower;
        } else if (lower.includes('vaapi')) {
            cliOptions.codec = 'h264_vaapi';
        } else if (lower.includes('qsv')) {
            cliOptions.codec = 'h264_qsv';
        } else if (lower.includes('nvenc')) {
            cliOptions.codec = 'h264_nvenc';
        } else if (lower.includes('hevc') || lower.includes('h265') || lower.includes('x265')) {
            cliOptions.codec = 'libx265';
        }
    }

    runEncode(cliOptions).catch((err) => {
        console.error('[enc_helper] Top-level error:', err);
        process.exit(1);
    });
}

module.exports = {
    runEncode,
    buildFFmpegArgs,
    getMediaInfo,
    resolveResolution,
    verifyOutputFile,
    timeStrToSeconds,
};
