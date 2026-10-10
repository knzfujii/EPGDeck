export interface AudioStreamInfo {
    index: number;
    channels: number;
    sample_rate: number;
}

export interface MediaInfo {
    duration: number;
    width: number;
    height: number;
    audioStreams: AudioStreamInfo[];
}

export type VideoCodec =
    // CPU
    | 'libx264'
    | 'libx265'
    | 'h264'
    | 'h265'
    | 'x264'
    | 'x265'
    | 'hevc'
    // NVIDIA NVENC
    | 'h264_nvenc'
    | 'hevc_nvenc'
    | 'h265_nvenc'
    | 'nvenc'
    | 'nvenc_h264'
    | 'nvenc_hevc'
    | 'nvenc_h265'
    // Linux VAAPI
    | 'h264_vaapi'
    | 'hevc_vaapi'
    | 'h265_vaapi'
    | 'vaapi'
    | 'vaapi_h264'
    | 'vaapi_hevc'
    | 'vaapi_h265'
    // Intel QSV
    | 'h264_qsv'
    | 'hevc_qsv'
    | 'h265_qsv'
    | 'qsv'
    | 'qsv_h264'
    | 'qsv_hevc'
    | 'qsv_h265'
    | (string & {});

export type ScalePreset = '1080p' | '720p' | '540p' | '480p' | 'native' | 'fhd' | 'hd' | 'qhd' | 'sd' | (string & {});

export type DualMonoMode = 'split' | 'main' | 'sub';
export type AudioStreamMode = 'first' | 'all';

export interface EncodeOptions {
    codec?: VideoCodec;
    preset?: string;
    tune?: string | null;
    crf?: number | null;
    videoBitrate?: string | null;
    maxrate?: string | null;
    bufsize?: string | null;
    scale?: ScalePreset | null;
    maxHeight?: number | null;
    fix1440to1920?: boolean;
    deinterlace?: boolean;
    dualMono?: DualMonoMode;
    audioStreamMode?: AudioStreamMode;
    mainAudioBitrate?: string;
    secondaryAudioBitrate?: string;
    subtitle?: boolean;
    skipSubtitleForSuperimpose?: boolean;
    faststart?: boolean;
    analyzeduration?: string;
    probesize?: string;
    maxMuxingQueueSize?: number;
    vaapiDevice?: string;
    vaapiHwaccel?: boolean;
    rcMode?: string | null;
    qp?: number | null;
    customArgs?: string[];
    modifyArgs?: ((args: string[]) => string[]) | null;
    verifyDuration?: boolean;
    minDurationSeconds?: number;
    minDurationRatio?: number;
    adaptiveBitrate?: boolean;
    autoBitrate?: boolean;
    quality?: QualityPresetName | number;
}

export type QualityPresetName = 'highest' | 'high' | 'standard' | 'economy';

export interface QualityConfig {
    crfEquivalent: number;
    minBps: number;
    maxBps: number;
    maxrateFactor: number;
}

export interface ProbeResult {
    videoBitrate: string;
    maxrate: string;
    bufsize: string;
    complexityKbps: number | null;
    probeCount: number;
    resFactor: number;
    cv: number | null;
    percentile: string;
    qSlope: number | null;
}

export interface EstimateOptions {
    quality?: QualityPresetName | number | string;
    samples?: number | null;
    sampleDuration?: number;
    ffmpegPath?: string;
    ffprobePath?: string;
    vaapiDevice?: string;
    targetWidth?: number;
    targetHeight?: number;
}

export interface VerificationResult {
    valid: boolean;
    reason?: string;
    outputDuration?: number;
}

export interface ResolutionResult {
    targetW: number;
    targetH: number;
    isScaled: boolean;
    is1440: boolean;
}
