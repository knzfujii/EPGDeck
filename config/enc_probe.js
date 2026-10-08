import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const FFMPEG_DEFAULT = '/opt/ffmpeg-custom/bin/ffmpeg';
const FFPROBE_DEFAULT = '/opt/ffmpeg-custom/bin/ffprobe';

/**
 * クオリティ指定のプリセット定義
 * - highest: 妥協なき最高峰画質 (前面展望で 6〜7Mbps、アニメで 3Mbps 前後)
 * - high: 高画質・推奨 (前面展望で 4〜4.5Mbps、アニメで 2.2Mbps 前後)
 * - standard: 標準バランス (前面展望で 3.2〜3.5Mbps、アニメで 1.9Mbps 前後)
 * - economy: 容量節約 (前面展望で 2.4〜2.6Mbps、アニメで 1.5Mbps 前後)
 */
export const QUALITY_PRESETS = {
    highest: {
        crfEquivalent: 20,
        minBps: 2000,
        maxBps: 8500,
        maxrateFactor: 1.8,
    },
    high: {
        crfEquivalent: 23,
        minBps: 1300,
        maxBps: 6500,
        maxrateFactor: 1.8,
    },
    standard: {
        crfEquivalent: 25,
        minBps: 1100,
        maxBps: 5200,
        maxrateFactor: 1.7,
    },
    economy: {
        crfEquivalent: 27,
        minBps: 900,
        maxBps: 3800,
        maxrateFactor: 1.6,
    },
};

/**
 * 動画のメタ情報 (duration, width, height) を取得
 */
export async function getMediaInfo(filePath, ffprobePath = FFPROBE_DEFAULT) {
    try {
        const { stdout } = await execFileAsync(ffprobePath, [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-show_entries', 'stream=width,height',
            '-select_streams', 'v:0',
            '-of', 'json',
            filePath,
        ]);
        const info = JSON.parse(stdout);
        return {
            duration: parseFloat(info.format?.duration || '0'),
            width: info.streams?.[0]?.width || 1920,
            height: info.streams?.[0]?.height || 1080,
        };
    } catch {
        return { duration: 0, width: 1920, height: 1080 };
    }
}

/**
 * 1サンプルのビットレート (kbps) を GPU CQP 30 で瞬間プローブ (-f null - でメモリ完結)
 */
export async function probeSampleBitrate(
    filePath,
    startSec,
    durationSec = 2.0,
    options = {}
) {
    const {
        ffmpegPath = FFMPEG_DEFAULT,
        vaapiDevice = '/dev/dri/renderD128',
        probeWidth = 1440,
        probeHeight = 1080,
        qp = 30,
    } = options;

    const scaleFilter = `scale_vaapi=w=${probeWidth}:h=${probeHeight}`;

    const args = [
        '-ss', String(startSec),
        '-t', String(durationSec),
        '-vaapi_device', vaapiDevice,
        '-i', filePath,
        '-vf', `format=nv12,hwupload,${scaleFilter}`,
        '-c:v', 'hevc_vaapi',
        '-rc_mode', 'CQP',
        '-qp', String(qp),
        '-an',
        '-f', 'null',
        '-',
    ];

    try {
        const { stderr } = await execFileAsync(ffmpegPath, args);
        const match = stderr.match(/video:(\d+)KiB/);
        if (match) {
            const kib = parseInt(match[1], 10);
            return Math.round((kib * 8192) / (durationSec * 1000));
        }
    } catch {
        // パケット破損・EOF 等は null 返却
    }
    return null;
}

/**
 * 品質パラメータ (文字列または数値) を正規化して minBps, maxBps を決定
 */
export function resolveQualityConfig(quality = 'high') {
    if (typeof quality === 'string' && QUALITY_PRESETS[quality]) {
        return QUALITY_PRESETS[quality];
    }

    const num = typeof quality === 'number' ? quality : parseInt(quality, 10);
    if (!isNaN(num)) {
        // CRF 数値指定 (例: 18〜28) に応じた連続スケーリング
        // CRF 20 -> highest (3000k〜6800k)
        // CRF 23 -> high (2200k〜4200k)
        // CRF 27 -> economy (1400k〜2500k)
        const t = Math.max(0, Math.min(1, (27 - num) / (27 - 19))); // 19(最高)〜27(最小)
        const minBps = Math.round(
            QUALITY_PRESETS.economy.minBps +
                (QUALITY_PRESETS.highest.minBps - QUALITY_PRESETS.economy.minBps) * t
        );
        const maxBps = Math.round(
            QUALITY_PRESETS.economy.maxBps +
                (QUALITY_PRESETS.highest.maxBps - QUALITY_PRESETS.economy.maxBps) * t
        );
        return {
            crfEquivalent: num,
            minBps,
            maxBps,
            maxrateFactor: 1.8,
        };
    }

    return QUALITY_PRESETS.high;
}

/**
 * 高度コンテンツ適応型ビットレート自動推定 (1: デュアルQP傾き, 2: 広域探索, 3: 分散マージン)
 */
export async function estimateOptimalBitrate(filePath, options = {}) {
    const {
        quality = 'high',
        samples = null,
        sampleDuration = 1.2,
        ffmpegPath = FFMPEG_DEFAULT,
        ffprobePath = FFPROBE_DEFAULT,
        vaapiDevice = '/dev/dri/renderD128',
        targetWidth = 1440,
        targetHeight = 1080,
    } = options;

    const qConfig = resolveQualityConfig(quality);
    const mediaInfo = await getMediaInfo(filePath, ffprobePath);
    const duration = mediaInfo.duration;

    // 出力解像度の総画素数に基づくスケーリング係数 (基準: 1440x1080 = 1,555,200画素)
    const refPixels = 1440 * 1080;
    const outPixels = Math.max(320 * 240, (targetWidth || 1440) * (targetHeight || 1080));
    const resFactor = Math.pow(outPixels / refPixels, 0.75);

    // 1分未満の極小ファイルや再生時間不明時は最小保証値を返却
    if (duration <= 60) {
        const minBps = Math.round((qConfig.minBps * resFactor) / 100) * 100;
        const maxrate = Math.round((minBps * qConfig.maxrateFactor) / 100) * 100;
        return {
            videoBitrate: `${minBps}k`,
            maxrate: `${maxrate}k`,
            bufsize: `${maxrate * 2}k`,
            complexityKbps: null,
            probeCount: 0,
            resFactor: parseFloat(resFactor.toFixed(3)),
            cv: null,
            percentile: 'P75',
            qSlope: null,
        };
    }

    // プローブ解像度: 元動画の解像度を超えない (アップスケール防止)
    const rawW = mediaInfo.width || 1440;
    const rawH = mediaInfo.height || 1080;
    let probeW = Math.min(rawW, 1440);
    let probeH = Math.min(rawH, 1080);
    probeW = Math.round(probeW / 2) * 2;
    probeH = Math.round(probeH / 2) * 2;

    // プローブ解像度が基準と異なる場合の正規化係数
    const probePixels = probeW * probeH;
    const probeFactor = Math.pow(probePixels / refPixels, 0.75);

    // 広域スキャン (アプローチ2: 30分未満12点、30分以上16点)
    const scanSamplesCount = samples || (duration > 1800 ? 16 : 12);
    const startSec = duration * 0.1;
    const endSec = duration * 0.9;
    const interval = (endSec - startSec) / (scanSamplesCount + 1);

    const scanPromises = [];
    const sampleTimes = [];
    for (let i = 1; i <= scanSamplesCount; i++) {
        const t = Math.round(startSec + interval * i);
        sampleTimes.push(t);
        scanPromises.push(
            probeSampleBitrate(filePath, t, sampleDuration, {
                ffmpegPath,
                vaapiDevice,
                probeWidth: probeW,
                probeHeight: probeH,
                qp: 30,
            })
        );
    }

    const scanResults = await Promise.all(scanPromises);
    const validSamples = [];
    for (let i = 0; i < scanResults.length; i++) {
        if (scanResults[i] !== null) {
            validSamples.push({ time: sampleTimes[i], kbps: scanResults[i] });
        }
    }

    if (validSamples.length === 0) {
        const minBps = Math.round((qConfig.minBps * resFactor) / 100) * 100;
        const maxrate = Math.round((minBps * qConfig.maxrateFactor) / 100) * 100;
        return {
            videoBitrate: `${minBps}k`,
            maxrate: `${maxrate}k`,
            bufsize: `${maxrate * 2}k`,
            complexityKbps: null,
            probeCount: 0,
            resFactor: parseFloat(resFactor.toFixed(3)),
            cv: null,
            percentile: 'P75',
            qSlope: null,
        };
    }

    // 外れ値トリム & 統計解析 (アプローチ3: 分散・変動係数 CV・動的パーセンタイル)
    validSamples.sort((a, b) => a.kbps - b.kbps);
    const trimmed = validSamples.length >= 6 ? validSamples.slice(1, -1) : validSamples;

    const rates = trimmed.map((s) => s.kbps);
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    const variance = rates.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / rates.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / (mean || 1);

    // 変動係数 CV に応じたパーセンタイルシフト
    let percentile = 0.75;
    if (cv < 0.25) {
        percentile = 0.60; // 安定した均一映像 (アニメ等) -> より低めに攻める
    } else if (cv > 0.45) {
        percentile = 0.85; // 激しい落差・ピークあり (特番・アクション映画) -> ピーク寄りに安全マージン
    }

    const pIndex = Math.min(trimmed.length - 1, Math.floor(trimmed.length * percentile));
    const rawComplexityKbps = trimmed[pIndex].kbps;
    const baseComplexity = rawComplexityKbps / (probeFactor || 1);

    // デュアルQP傾き測定 (アプローチ1: 最難関の上位2箇所だけ QP 24 を追加測定)
    const peakSamples = trimmed.slice(-2);
    const qp24Promises = peakSamples.map((s) =>
        probeSampleBitrate(filePath, s.time, sampleDuration, {
            ffmpegPath,
            vaapiDevice,
            probeWidth: probeW,
            probeHeight: probeH,
            qp: 24,
        })
    );
    const qp24Results = await Promise.all(qp24Promises);

    let qSlope = 1.6; // デフォルト (一般的な比率)
    const slopes = [];
    for (let i = 0; i < qp24Results.length; i++) {
        if (qp24Results[i] && peakSamples[i].kbps > 0) {
            slopes.push(qp24Results[i] / peakSamples[i].kbps);
        }
    }
    if (slopes.length > 0) {
        qSlope = slopes.reduce((a, b) => a + b, 0) / slopes.length;
    }

    // 複雑度マッピング (アニメ等: ~2000kbps -> 一般: 3500〜5000kbps -> 前面展望・高難関: 12000kbps+)
    const norm = Math.max(0, Math.min(1, (baseComplexity - 1200) / (12500 - 1200)));
    // アニメ等の低複雑度領域を過剰に底上げせず、激しい実写のみをしっかり押し上げる非線形カーブ (norm^1.4)
    const normCurve = Math.pow(norm, 1.4);
    const baseTargetBps = qConfig.minBps + (qConfig.maxBps - qConfig.minBps) * normCurve;

    // 出力解像度係数を適用
    let targetBps = Math.round((baseTargetBps * resFactor) / 100) * 100;
    const maxrateFactor = norm >= 0.7 ? Math.max(qConfig.maxrateFactor, 2.0) : qConfig.maxrateFactor;
    const maxrate = Math.round((targetBps * maxrateFactor) / 100) * 100;
    const bufsize = maxrate * 2;

    return {
        videoBitrate: `${targetBps}k`,
        maxrate: `${maxrate}k`,
        bufsize: `${bufsize}k`,
        complexityKbps: Math.round(baseComplexity),
        probeCount: validSamples.length,
        resFactor: parseFloat(resFactor.toFixed(3)),
        cv: parseFloat(cv.toFixed(3)),
        percentile: `P${Math.round(percentile * 100)}`,
        qSlope: parseFloat(qSlope.toFixed(2)),
    };
}
