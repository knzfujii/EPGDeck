import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// @ts-expect-error no types for enc_helper
import { timeStrToSeconds, buildFFmpegArgs, formatCommand } from '../../config/enc_helper.js';

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

            const args = buildFFmpegArgs(
                {
                    dualMono: 'split',
                    mainAudioBitrate: '256k',
                    secondaryAudioBitrate: '96k',
                },
                mediaInfo,
            );

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

            const args = buildFFmpegArgs(
                {
                    audioStreamMode: 'all',
                    mainAudioBitrate: '192k',
                    secondaryAudioBitrate: '128k',
                },
                mediaInfo,
            );

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
            expect(args).toContain(
                '[0:a:0]channelsplit[FL_raw][FR_raw];[FL_raw]aformat=channel_layouts=mono[FL];[FR_raw]aformat=channel_layouts=mono[FR]',
            );
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
            expect(args).toContain(
                '[0:a:0]channelsplit=channel_layout=stereo:channels=FL[FL];[FL]aformat=channel_layouts=mono[aout]',
            );
            expect(args).toContain('title=Main');
            expect(args).not.toContain('title=Sub');
        });

        it('should keep 1440x1080 resolution for VAAPI by default (fix1440to1920: false)', () => {
            const mediaInfo = {
                duration: 1800,
                width: 1440,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs(
                {
                    codec: 'h264_vaapi',
                    vaapiDevice: '/dev/dri/renderD128',
                    videoBitrate: '4500k',
                },
                mediaInfo,
            );

            expect(args).toContain('-vaapi_device');
            expect(args).toContain('/dev/dri/renderD128');
            expect(args).toContain('-hwaccel');
            expect(args).toContain('vaapi');
            expect(args).toContain('-vf');
            expect(args).toContain('deinterlace_vaapi');
            expect(args).not.toContain('scale_vaapi=w=1920:h=1080');
            expect(args).toContain('-c:v');
            expect(args).toContain('h264_vaapi');
            expect(args).toContain('-b:v');
            expect(args).toContain('4500k');
        });

        it('should scale 1440x1080 to 1920x1080 for VAAPI when fix1440to1920 is true', () => {
            const mediaInfo = {
                duration: 1800,
                width: 1440,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs(
                {
                    codec: 'h264_vaapi',
                    vaapiDevice: '/dev/dri/renderD128',
                    videoBitrate: '4500k',
                    fix1440to1920: true,
                },
                mediaInfo,
            );

            expect(args).toContain('-vf');
            expect(args).toContain('deinterlace_vaapi,scale_vaapi=w=1920:h=1080,setsar=1/1');
        });

        it('should support VAAPI with CPU decode (vaapiHwaccel: false), maxrate, bufsize, rcMode, and fix1440to1920', () => {
            const mediaInfo = {
                duration: 1800,
                width: 1440,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs(
                {
                    codec: 'hevc_vaapi',
                    vaapiDevice: '/dev/dri/renderD128',
                    vaapiHwaccel: false,
                    videoBitrate: '4000k',
                    maxrate: '6000k',
                    bufsize: '12000k',
                    rcMode: 'VBR',
                    fix1440to1920: true,
                },
                mediaInfo,
            );

            expect(args).toContain('-vaapi_device');
            expect(args).toContain('/dev/dri/renderD128');
            expect(args).not.toContain('-hwaccel');
            expect(args).toContain('-vf');
            expect(args).toContain('yadif,format=nv12,hwupload,scale_vaapi=w=1920:h=1080,setsar=1/1');
            expect(args).toContain('-c:v');
            expect(args).toContain('hevc_vaapi');
            expect(args).toContain('-b:v');
            expect(args).toContain('4000k');
            expect(args).toContain('-maxrate');
            expect(args).toContain('6000k');
            expect(args).toContain('-rc_mode');
            expect(args).toContain('VBR');
            expect(args).toContain('-bsf:v');
            expect(args).toContain('hevc_metadata=height=1080');
        });

        it('should support CQP rate control mode and qp for VAAPI encoders without -b:v', () => {
            const mediaInfo = {
                duration: 1800,
                width: 1440,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs(
                {
                    codec: 'hevc_vaapi',
                    vaapiDevice: '/dev/dri/renderD128',
                    rcMode: 'CQP',
                    qp: 33,
                },
                mediaInfo,
            );

            expect(args).toContain('-rc_mode');
            expect(args).toContain('CQP');
            expect(args).toContain('-qp');
            expect(args).toContain('33');
            expect(args).not.toContain('-b:v');
        });

        it('should fallback to crf when qp is omitted in CQP mode for VAAPI', () => {
            const mediaInfo = {
                duration: 1800,
                width: 1440,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs(
                {
                    codec: 'hevc_vaapi',
                    vaapiDevice: '/dev/dri/renderD128',
                    rcMode: 'CQP',
                    crf: 28,
                },
                mediaInfo,
            );

            expect(args).toContain('-rc_mode');
            expect(args).toContain('CQP');
            expect(args).toContain('-qp');
            expect(args).toContain('28');
            expect(args).not.toContain('-b:v');
        });

        it('should enable CQP mode automatically when qp option is specified for VAAPI', () => {
            const mediaInfo = {
                duration: 1800,
                width: 1440,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs(
                {
                    codec: 'hevc_vaapi',
                    vaapiDevice: '/dev/dri/renderD128',
                    qp: 34,
                },
                mediaInfo,
            );

            expect(args).toContain('-rc_mode');
            expect(args).toContain('CQP');
            expect(args).toContain('-qp');
            expect(args).toContain('34');
            expect(args).not.toContain('-b:v');
        });

        it('should resolve fallback bitrate according to quality preset when videoBitrate is omitted or auto', () => {
            const mediaInfo = {
                duration: 1800,
                width: 1440,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const argsHighest = buildFFmpegArgs(
                {
                    codec: 'hevc_vaapi',
                    vaapiDevice: '/dev/dri/renderD128',
                    quality: 'highest',
                },
                mediaInfo,
            );

            expect(argsHighest).toContain('-c:v');
            expect(argsHighest).toContain('hevc_vaapi');
            expect(argsHighest).toContain('-b:v');
            expect(argsHighest).toContain('5300k');

            const argsHigh = buildFFmpegArgs(
                {
                    codec: 'hevc_vaapi',
                    vaapiDevice: '/dev/dri/renderD128',
                    quality: 'high',
                    videoBitrate: 'auto',
                },
                mediaInfo,
            );
            expect(argsHigh).toContain('-b:v');
            expect(argsHigh).toContain('3900k');

            const args720p = buildFFmpegArgs(
                {
                    codec: 'hevc_vaapi',
                    vaapiDevice: '/dev/dri/renderD128',
                    quality: 'high',
                    scale: '720p',
                },
                mediaInfo,
            );
            expect(args720p).toContain('-b:v');
            expect(args720p).toContain('2600k');
        });

        it('should support tune, maxrate, and bufsize for CPU encoders', () => {
            const mediaInfo = {
                duration: 1800,
                width: 1920,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs(
                {
                    codec: 'libx264',
                    tune: 'animation',
                    crf: 23,
                    maxrate: '5000k',
                    bufsize: '10000k',
                },
                mediaInfo,
            );

            expect(args).toContain('-c:v');
            expect(args).toContain('libx264');
            expect(args).toContain('-tune');
            expect(args).toContain('animation');
            expect(args).toContain('-crf');
            expect(args).toContain('23');
            expect(args).toContain('-maxrate');
            expect(args).toContain('5000k');
            expect(args).toContain('-bufsize');
            expect(args).toContain('10000k');
        });

        it('should include subtitle streams and -fix_sub_duration when subtitle is true', () => {
            const mediaInfo = {
                duration: 1800,
                width: 1920,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs({ subtitle: true }, mediaInfo);

            expect(args).toContain('-fix_sub_duration');
            const fixSubIndex = args.indexOf('-fix_sub_duration');
            const inputIndex = args.indexOf('-i');
            expect(fixSubIndex).toBeLessThan(inputIndex);

            expect(args).toContain('-map');
            expect(args).toContain('0:s?');
            expect(args).toContain('-c:s');
            expect(args).toContain('mov_text');
            expect(args).toContain('-metadata:s:s:0');
            expect(args).toContain('language=jpn');
            expect(args).not.toContain('-sn');
        });

        it('should enable subtitle streams when process.env.SUBTITLE is true', () => {
            process.env.SUBTITLE = 'true';
            const mediaInfo = {
                duration: 1800,
                width: 1920,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs({}, mediaInfo);

            expect(args).toContain('-fix_sub_duration');
            expect(args).toContain('mov_text');
            expect(args).not.toContain('-sn');
        });

        it('should exclude subtitle streams and include -sn when subtitle is false', () => {
            process.env.SUBTITLE = 'false';
            const mediaInfo = {
                duration: 1800,
                width: 1920,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs({ subtitle: false }, mediaInfo);

            expect(args).not.toContain('-fix_sub_duration');
            expect(args).not.toContain('mov_text');
            expect(args).toContain('-sn');
        });

        it('should force disable subtitle when process.env.SUBTITLE is explicitly false even if options.subtitle is true', () => {
            process.env.SUBTITLE = 'false';
            const mediaInfo = {
                duration: 1800,
                width: 1920,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs({ subtitle: true }, mediaInfo);

            expect(args).not.toContain('-fix_sub_duration');
            expect(args).not.toContain('mov_text');
            expect(args).toContain('-sn');
        });

        it('should skip subtitle when SKIP_SUBTITLE_FOR_SUPERIMPOSE is true and program contains 字幕スーパー', () => {
            process.env.SKIP_SUBTITLE_FOR_SUPERIMPOSE = 'true';
            process.env.NAME = 'シネマ「グリーンマイル」＜字幕スーパー＞';
            const mediaInfo = {
                duration: 1800,
                width: 1920,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs({ subtitle: true }, mediaInfo);

            expect(args).not.toContain('-fix_sub_duration');
            expect(args).not.toContain('mov_text');
            expect(args).toContain('-sn');
        });

        it('should skip subtitle when options.skipSubtitleForSuperimpose is true and program contains 字幕スーパー', () => {
            process.env.DESCRIPTION = '本編は字幕スーパー版でお送りします';
            const mediaInfo = {
                duration: 1800,
                width: 1920,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs({ subtitle: true, skipSubtitleForSuperimpose: true }, mediaInfo);

            expect(args).not.toContain('-fix_sub_duration');
            expect(args).not.toContain('mov_text');
            expect(args).toContain('-sn');
        });
    });

    describe('encoding templates ESM compliance', () => {
        const templateFiles = [
            'config/enc.js.template',
            'config/enc_1080p.js.template',
            'config/enc_720p.js.template',
            'config/enc_nvenc.js.template',
            'config/enc_qsv.js.template',
            'config/enc_vaapi.js.template',
        ];

        it('should use ESM import syntax and avoid require in all template files', async () => {
            const fs = await import('fs');
            const path = await import('path');

            for (const file of templateFiles) {
                const fullPath = path.resolve(process.cwd(), file);
                expect(fs.existsSync(fullPath)).toBe(true);

                const content = fs.readFileSync(fullPath, 'utf-8');
                expect(content).toContain("import { runEncode } from './enc_helper.js';");
                expect(content).not.toContain('require(');
            }
        });

        it('should ensure enc_helper.js uses ESM imports and has no require calls', async () => {
            const fs = await import('fs');
            const path = await import('path');

            const helperPath = path.resolve(process.cwd(), 'config/enc_helper.js');
            const content = fs.readFileSync(helperPath, 'utf-8');

            expect(content).toContain("import { spawn, execFile } from 'node:child_process';");
            expect(content).not.toContain('require(');
        });

        it('should ensure any existing active config/enc*.js scripts use ESM and do not contain require', async () => {
            const fs = await import('fs');
            const path = await import('path');

            const configDir = path.resolve(process.cwd(), 'config');
            const files = fs.readdirSync(configDir);
            const activeEncFiles = files.filter(
                f => f.startsWith('enc') && f.endsWith('.js') && f !== 'enc_helper.js' && f !== 'enc_probe.js',
            );

            for (const file of activeEncFiles) {
                const fullPath = path.join(configDir, file);
                const content = fs.readFileSync(fullPath, 'utf-8');
                expect(content).toContain("import { runEncode } from './enc_helper.js';");
                expect(content).not.toContain('require(');
            }
        });
    });

    describe('formatCommand', () => {
        it('should format simple arguments without quotes', () => {
            const result = formatCommand('/usr/bin/ffmpeg', ['-y', '-i', 'input.ts', 'output.mp4']);
            expect(result).toBe('/usr/bin/ffmpeg -y -i input.ts output.mp4');
        });

        it('should quote arguments containing spaces and special characters', () => {
            const result = formatCommand('/usr/bin/ffmpeg', [
                '-i',
                '/path/to/movie title [sub].ts',
                '-filter_complex',
                '[0:a:0]channelsplit[FL][FR]',
                '/path/to/output (1080p).mp4',
            ]);
            expect(result).toBe(
                '/usr/bin/ffmpeg -i "/path/to/movie title [sub].ts" -filter_complex "[0:a:0]channelsplit[FL][FR]" "/path/to/output (1080p).mp4"',
            );
        });
    });
});
