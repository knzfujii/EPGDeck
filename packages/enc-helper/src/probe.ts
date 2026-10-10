import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import type { QualityConfig, QualityPresetName, ProbeResult, EstimateOptions } from './types.js';

const execFileAsync = promisify(execFile);

const FFMPEG_DEFAULT = fs.existsSync('/opt/ffmpeg9-custom/bin/ffmpeg')
    ? '/opt/ffmpeg9-custom/bin/ffmpeg'
    : '/usr/bin/ffmpeg';
const FFPROBE_DEFAULT = fs.existsSync('/opt/ffmpeg9-custom/bin/ffprobe')
    ? '/opt/ffmpeg9-custom/bin/ffprobe'
    : '/usr/bin/ffprobe';

/**
 * クオリティ指定のプリセット定義
 * - highest: 妥協なき最高峰画質 (前面展望で 10〜12Mbps、アニメで 2.5Mbps 前後)
 * - high: 高画質・推奨 (前面展望で 8〜10Mbps、アニメで 1.2〜1.4Mbps 前後)
 * - standard: 標準バランス (前面展望で 6〜7Mbps、アニメで 1.0〜1.2Mbps 前後)
 * - economy: 容量節約 (前面展望で 4〜5Mbps、アニメで 0.8〜1.0Mbps 前後)
 */
export const QUALITY_PRESETS: Record<QualityPresetName, QualityConfig> = {
    highest: {
        crfEquivalent: 20,
        minBps: 1300,
        maxBps: 12000,
        maxrateFactor: 2.0,
    },
    high: {
        crfEquivalent: 23,
        minBps: 880,
        maxBps: 8500,
        maxrateFactor: 1.8,
    },
    standard: {
        crfEquivalent: 25,
        minBps: 750,
        maxBps: 7500,
        maxrateFactor: 1.6,
    },
    economy: {
        crfEquivalent: 27,
        minBps: 650,
        maxBps: 5500,
        maxrateFactor: 1.5,
    },
};

/**
 * 動画のメタ情報 (duration, width, height) を取得
 */
export async function getProbeMediaInfo(
    filePath: string,
    ffprobePath: string = FFPROBE_DEFAULT,
): Promise<{ duration: number; width: number; height: number }> {
    try {
        const { stdout } = await execFileAsync(ffprobePath, [
            '-v',
            'error',
            '-show_entries',
            'format=duration',
            '-show_entries',
            'stream=width,height',
            '-select_streams',
            'v:0',
            '-of',
            'json',
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
    filePath: string,
    startSec: number,
    durationSec: number = 2.0,
    options: {
        ffmpegPath?: string;
        vaapiDevice?: string;
        probeWidth?: number;
        probeHeight?: number;
        qp?: number;
    } = {},
): Promise<number | null> {
    const {
        ffmpegPath = FFMPEG_DEFAULT,
        vaapiDevice = '/dev/dri/renderD128',
        probeWidth = 1440,
        probeHeight = 1080,
        qp = 30,
    } = options;

    const scaleFilter = `scale_vaapi=w=${probeWidth}:h=${probeHeight}`;

    const args = [
        '-ss',
        String(startSec),
        '-t',
        String(durationSec),
        '-vaapi_device',
        vaapiDevice,
        '-i',
        filePath,
        '-vf',
        `format=nv12,hwupload,deinterlace_vaapi,${scaleFilter}`,
        '-c:v',
        'hevc_vaapi',
        '-rc_mode',
        'CQP',
        '-qp',
        String(qp),
        '-an',
        '-f',
        'null',
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
 * 指定された quality 指定から QualityConfig を解決
 */
export function resolveQualityConfig(quality?: QualityPresetName | number | string): QualityConfig {
    if (typeof quality === 'string' && quality in QUALITY_PRESETS) {
        return QUALITY_PRESETS[quality as QualityPresetName];
    }

    const num = typeof quality === 'number' ? quality : parseInt(String(quality || ''), 10);
    if (!isNaN(num)) {
        // CRF 数値指定 (例: 18〜28) に応じた連続スケーリング
        const t = Math.max(0, Math.min(1, (27 - num) / (27 - 19)));
        const minBps = Math.round(
            QUALITY_PRESETS.economy.minBps +
                (QUALITY_PRESETS.highest.minBps - QUALITY_PRESETS.economy.minBps) * t,
        );
        const maxBps = Math.round(
            QUALITY_PRESETS.economy.maxBps +
                (QUALITY_PRESETS.highest.maxBps - QUALITY_PRESETS.economy.maxBps) * t,
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
export async function estimateOptimalBitrate(
    filePath: string,
    options: EstimateOptions = {},
): Promise<ProbeResult> {
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
    const mediaInfo = await getProbeMediaInfo(filePath, ffprobePath);
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

    const probePixels = probeW * probeH;
    const probeFactor = Math.pow(probePixels / refPixels, 0.75);

    // 広域スキャン (30分未満12点、30分以上16点)
    const scanSamplesCount = samples || (duration > 1800 ? 16 : 12);
    const startSec = duration * 0.1;
    const endSec = duration * 0.9;
    const interval = (endSec - startSec) / (scanSamplesCount + 1);

    const scanPromises: Promise<number | null>[] = [];
    const sampleTimes: number[] = [];
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
            }),
        );
    }

    const scanResults = await Promise.all(scanPromises);
    const validSamples: { time: number; kbps: number }[] = [];
    for (let i = 0; i < scanResults.length; i++) {
        const val = scanResults[i];
        if (val !== null) {
            validSamples.push({ time: sampleTimes[i], kbps: val });
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

    // 外れ値トリム & 統計解析
    validSamples.sort((a, b) => a.kbps - b.kbps);
    const trimmed = validSamples.length >= 6 ? validSamples.slice(1, -1) : validSamples;

    const rates = trimmed.map((s) => s.kbps);
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    const variance = rates.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / rates.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / (mean || 1);

    let percentile = 0.75;
    if (cv < 0.25) {
        percentile = 0.6; // 安定した均一映像 (アニメ等) -> より低めに攻める
    } else if (cv > 0.45) {
        percentile = 0.85; // 激しい落差・ピークあり (特番・アクション映画) -> ピーク寄りに安全マージン
    }

    const pIndex = Math.min(trimmed.length - 1, Math.floor(trimmed.length * percentile));
    const rawComplexityKbps = trimmed[pIndex].kbps;
    const baseComplexity = rawComplexityKbps / (probeFactor || 1);

    // デュアルQP傾き測定 (最難関の上位2箇所だけ QP 24 を追加測定)
    const peakSamples = trimmed.slice(-2);
    const qp24Promises = peakSamples.map((s) =>
        probeSampleBitrate(filePath, s.time, sampleDuration, {
            ffmpegPath,
            vaapiDevice,
            probeWidth: probeW,
            probeHeight: probeH,
            qp: 24,
        }),
    );
    const qp24Results = await Promise.all(qp24Promises);

    let qSlope = 1.6;
    const slopes: number[] = [];
    for (let i = 0; i < qp24Results.length; i++) {
        const r24 = qp24Results[i];
        if (r24 && peakSamples[i].kbps > 0) {
            slopes.push(r24 / peakSamples[i].kbps);
        }
    }
    if (slopes.length > 0) {
        qSlope = slopes.reduce((a, b) => a + b, 0) / slopes.length;
    }

    // 複雑度マッピング (アニメ等: ~2000kbps -> 一般: 3000〜5000kbps -> 前面展望・高難関: 12000kbps+)
    const norm = Math.max(0, Math.min(1, (baseComplexity - 2000) / (13000 - 2000)));
    const normCurve = Math.pow(norm, 1.35);

    // Q-Slope によるディテール適応補正
    // qSlope >= 2.8: 高周波ディテールが詰まった自然風景等 -> ディテール維持のためマイルドに底上げ (+5%)
    // qSlope <= 2.35 かつ 中程度複雑度: テロップ・スタジオ照明でCQPが高めに出るバラエティ等 -> 過熱を抑えて風景との逆転防止
    let slopeFactor = 1.0;
    if (qSlope !== null) {
        if (qSlope >= 2.8) {
            slopeFactor = 1.05;
        } else if (qSlope <= 2.35 && baseComplexity < 6500) {
            slopeFactor = 0.85;
        }
    }

    const baseTargetBps = (qConfig.minBps + (qConfig.maxBps - qConfig.minBps) * normCurve) * slopeFactor;

    // 出力解像度係数を適用 (minAbsoluteBps 500k を下限、maxBps を上限キャップとする)
    const minAbsoluteBps = Math.max(500, Math.round((qConfig.minBps * resFactor) / 100) * 100);
    const scaledBps = Math.round((baseTargetBps * resFactor) / 100) * 100;
    const targetBps = Math.min(qConfig.maxBps, Math.max(minAbsoluteBps, scaledBps));
    const maxrateFactor = norm >= 0.6 ? Math.max(qConfig.maxrateFactor, 1.8) : qConfig.maxrateFactor;
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
