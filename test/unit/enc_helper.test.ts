import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// @ts-ignore
const { timeStrToSeconds, buildFFmpegArgs } = require('../../config/enc_helper.js');

describe('enc_helper.js', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = {
            ...originalEnv,
            INPUT: '/path/to/input.ts',
            OUTPUT: '/path/to/output.mp4',
            VIDEORESOLUTION: '1080',
            AUDIOCOMPONENTTYPE: '1',
        };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('timeStrToSeconds', () => {
        it('should correctly parse HH:MM:SS.ms string', () => {
            expect(timeStrToSeconds('00:00:10.50')).toBe(10.5);
            expect(timeStrToSeconds('00:02:30.00')).toBe(150);
            expect(timeStrToSeconds('01:15:30.25')).toBe(4530.25);
        });

        it('should return 0 for empty or invalid input', () => {
            expect(timeStrToSeconds('')).toBe(0);
            expect(timeStrToSeconds(null as any)).toBe(0);
        });
    });

    describe('buildFFmpegArgs', () => {
        it('should keep 1440x1080 resolution when fix1440to1920 is false (default for CPU)', () => {
            const mediaInfo = {
                duration: 1800,
                width: 1440,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs({ codec: 'libx264', fix1440to1920: false }, mediaInfo);

            // スケーリングなし
            expect(args).not.toContain('scale=1920:1080');
            expect(args).toContain('-aspect');
            expect(args).toContain('16:9');
        });

        it('should scale to 1920x1080 when fix1440to1920 is true', () => {
            const mediaInfo = {
                duration: 1800,
                width: 1440,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs({ codec: 'libx264', fix1440to1920: true }, mediaInfo);

            expect(args).toContain('-vf');
            expect(args).toContain('yadif,scale=1920:1080,setsar=1/1');
        });

        it('should handle scale option string (720p, 540p, custom W:H)', () => {
            const mediaInfo = {
                duration: 1800,
                width: 1920,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args720 = buildFFmpegArgs({ scale: '720p' }, mediaInfo);
            expect(args720).toContain('yadif,scale=1280:720,setsar=1/1');

            const args540 = buildFFmpegArgs({ scale: '540p' }, mediaInfo);
            expect(args540).toContain('yadif,scale=960:540,setsar=1/1');

            const argsCustom = buildFFmpegArgs({ scale: '854:480' }, mediaInfo);
            expect(argsCustom).toContain('yadif,scale=854:480,setsar=1/1');
        });

        it('should configure independent main and secondary audio bitrates', () => {
            process.env.AUDIOCOMPONENTTYPE = '2'; // デュアルモノ

            const mediaInfo = {
                duration: 1800,
                width: 1920,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs({
                dualMono: 'split',
                mainAudioBitrate: '256k',
                secondaryAudioBitrate: '96k',
            }, mediaInfo);

            expect(args).toContain('-b:a:0');
            expect(args).toContain('256k');
            expect(args).toContain('-b:a:1');
            expect(args).toContain('96k');
        });

        it('should extract first audio track by default (audioStreamMode: first)', () => {
            const mediaInfo = {
                duration: 1800,
                width: 1920,
                height: 1080,
                audioStreams: [
                    { index: 0, channels: 2, sample_rate: 48000 },
                    { index: 1, channels: 2, sample_rate: 48000 },
                ],
            };

            const args = buildFFmpegArgs({ mainAudioBitrate: '192k' }, mediaInfo);

            expect(args).toContain('-map');
            expect(args).toContain('0:a:0');
            expect(args).not.toContain('0:a:1');
            expect(args).toContain('-b:a:0');
            expect(args).toContain('192k');
        });

        it('should preserve all audio tracks when audioStreamMode is all', () => {
            const mediaInfo = {
                duration: 1800,
                width: 1920,
                height: 1080,
                audioStreams: [
                    { index: 0, channels: 2, sample_rate: 48000 },
                    { index: 1, channels: 2, sample_rate: 48000 },
                ],
            };

            const args = buildFFmpegArgs({
                audioStreamMode: 'all',
                mainAudioBitrate: '192k',
                secondaryAudioBitrate: '128k',
            }, mediaInfo);

            expect(args).toContain('0:a:0');
            expect(args).toContain('0:a:1');
            expect(args).toContain('-b:a:0');
            expect(args).toContain('192k');
            expect(args).toContain('-b:a:1');
            expect(args).toContain('128k');
        });

        it('should handle dual mono audio split into 2 tracks', () => {
            process.env.AUDIOCOMPONENTTYPE = '2'; // デュアルモノ

            const mediaInfo = {
                duration: 1800,
                width: 1920,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs({ dualMono: 'split' }, mediaInfo);

            expect(args).toContain('-filter_complex');
            expect(args).toContain('[0:a:0]channelsplit[FL_raw][FR_raw];[FL_raw]aformat=channel_layouts=mono[FL];[FR_raw]aformat=channel_layouts=mono[FR]');
            expect(args).toContain('title=Main');
            expect(args).toContain('title=Sub');
        });

        it('should extract main audio only when dualMono is main', () => {
            process.env.AUDIOCOMPONENTTYPE = '2';

            const mediaInfo = {
                duration: 1800,
                width: 1920,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs({ dualMono: 'main' }, mediaInfo);

            expect(args).toContain('-filter_complex');
            expect(args).toContain('[0:a:0]channelsplit=channel_layout=stereo:channels=FL[FL];[FL]aformat=channel_layouts=mono[aout]');
            expect(args).toContain('title=Main');
            expect(args).not.toContain('title=Sub');
        });

        it('should build VAAPI hardware encoding arguments with 1440p scale_vaapi', () => {
            const mediaInfo = {
                duration: 1800,
                width: 1440,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs({
                codec: 'h264_vaapi',
                vaapiDevice: '/dev/dri/renderD128',
                videoBitrate: '4500k',
            }, mediaInfo);

            expect(args).toContain('-vaapi_device');
            expect(args).toContain('/dev/dri/renderD128');
            expect(args).toContain('-hwaccel');
            expect(args).toContain('vaapi');
            expect(args).toContain('-vf');
            expect(args).toContain('deinterlace_vaapi,scale_vaapi=w=1920:h=1080,setsar=1/1');
            expect(args).toContain('-c:v');
            expect(args).toContain('h264_vaapi');
            expect(args).toContain('-b:v');
            expect(args).toContain('4500k');
        });

        it('should include subtitle streams when subtitle is true', () => {
            const mediaInfo = {
                duration: 1800,
                width: 1920,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs({ subtitle: true }, mediaInfo);

            expect(args).toContain('-map');
            expect(args).toContain('0:s?');
            expect(args).toContain('-c:s');
            expect(args).toContain('mov_text');
            expect(args).not.toContain('-sn');
        });
    });
});
