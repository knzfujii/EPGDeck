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

        it('should automatically normalize horizontal resolution to 16:9 square pixels (1280x720) when scaling 1440x1080 with maxHeight', () => {
            const mediaInfo1440 = {
                duration: 1800,
                width: 1440,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            // maxHeight: 720 を指定した場合、1440x1080 から 960x720 ではなく 1280x720 に自動正規化されること
            const args720 = buildFFmpegArgs({ codec: 'libx264', maxHeight: 720 }, mediaInfo1440);
            expect(args720).toContain('yadif,scale=1280:720,setsar=1/1');

            // maxHeight: 540 を指定した場合も 960x540 に自動正規化されること
            const args540 = buildFFmpegArgs({ codec: 'libx264', maxHeight: 540 }, mediaInfo1440);
            expect(args540).toContain('yadif,scale=960:540,setsar=1/1');
        });

        it('should support tune, maxrate, and bufsize for CPU encoders and auto-fallback bufsize', () => {
            const mediaInfo = {
                duration: 1800,
                width: 1920,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs(
                {
                    codec: 'libx264',
                    preset: 'fast',
                    tune: 'animation',
                    crf: 23,
                    videoBitrate: '2000k',
                    maxrate: '3000k',
                    bufsize: '6000k',
                },
                mediaInfo,
            );

            expect(args).toContain('-tune');
            expect(args).toContain('animation');
            // videoBitrate が指定された場合、crf は排他制御で除外されること
            expect(args).toContain('-b:v');
            expect(args).toContain('2000k');
            expect(args).not.toContain('-crf');
            expect(args).toContain('-maxrate');
            expect(args).toContain('3000k');
            expect(args).toContain('-bufsize');
            expect(args).toContain('6000k');

            // bufsize 省略時に maxrate の 2倍が自動補完されること
            const argsAutoBuf = buildFFmpegArgs(
                {
                    codec: 'libx264',
                    maxrate: '4000k',
                },
                mediaInfo,
            );
            expect(argsAutoBuf).toContain('-maxrate');
            expect(argsAutoBuf).toContain('4000k');
            expect(argsAutoBuf).toContain('-bufsize');
            expect(argsAutoBuf).toContain('8000k');
            expect(argsAutoBuf).toContain('-crf'); // videoBitrate なしなので crf 有効

            // NVENC では CPU 向け tune (animation 等) が渡されないこと
            const argsNvenc = buildFFmpegArgs(
                {
                    codec: 'h264_nvenc',
                    tune: 'animation',
                },
                mediaInfo,
            );
            expect(argsNvenc).not.toContain('animation');
        });

        it('should attach setsar=4/3 for 1440x1080 when unscaled to preserve display aspect ratio', () => {
            const mediaInfo1440 = {
                duration: 1800,
                width: 1440,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            const args = buildFFmpegArgs({ codec: 'libx264', fix1440to1920: false }, mediaInfo1440);
            expect(args).toContain('yadif,setsar=4/3');
            expect(args).toContain('-aspect');
            expect(args).toContain('16:9');
        });

        describe('Parameter combinations', () => {
            const mediaInfo1440 = {
                duration: 1800,
                width: 1440,
                height: 1080,
                audioStreams: [{ index: 0, channels: 2, sample_rate: 48000 }],
            };

            it('Combination 1: x265 with tune grain, crf 28, maxrate and explicit bufsize', () => {
                const args = buildFFmpegArgs(
                    {
                        codec: 'libx265',
                        preset: 'slow',
                        tune: 'grain',
                        crf: 28,
                        maxrate: '2000k',
                        bufsize: '3000k',
                        maxHeight: 720,
                    },
                    mediaInfo1440,
                );

                expect(args).toContain('-c:v');
                expect(args).toContain('libx265');
                expect(args).toContain('-preset');
                expect(args).toContain('slow');
                expect(args).toContain('-tune');
                expect(args).toContain('grain');
                expect(args).toContain('-crf');
                expect(args).toContain('28');
                expect(args).not.toContain('-b:v');
                expect(args).toContain('-maxrate');
                expect(args).toContain('2000k');
                expect(args).toContain('-bufsize');
                expect(args).toContain('3000k'); // 明示指定が優先されること
                expect(args).toContain('yadif,scale=1280:720,setsar=1/1');
            });

            it('Combination 2: ABR mode with videoBitrate + maxrate + bufsize (CRF must be excluded)', () => {
                const args = buildFFmpegArgs(
                    {
                        codec: 'libx264',
                        preset: 'medium',
                        videoBitrate: '2500k',
                        maxrate: '4000k',
                        bufsize: '8000k',
                        maxHeight: 1080,
                        fix1440to1920: true,
                    },
                    mediaInfo1440,
                );

                expect(args).toContain('-b:v');
                expect(args).toContain('2500k');
                expect(args).not.toContain('-crf');
                expect(args).toContain('-maxrate');
                expect(args).toContain('4000k');
                expect(args).toContain('-bufsize');
                expect(args).toContain('8000k');
                expect(args).toContain('yadif,scale=1920:1080,setsar=1/1');
            });

            it('Combination 3: QSV encoder with videoBitrate (global_quality must be excluded)', () => {
                const args = buildFFmpegArgs(
                    {
                        codec: 'h264_qsv',
                        preset: 'veryfast',
                        videoBitrate: '3000k',
                        crf: 23, // 指定されていても videoBitrate により除外されるべき
                        maxrate: '4500k',
                    },
                    mediaInfo1440,
                );

                expect(args).toContain('-c:v');
                expect(args).toContain('h264_qsv');
                expect(args).toContain('-b:v');
                expect(args).toContain('3000k');
                expect(args).not.toContain('-global_quality');
                expect(args).toContain('-maxrate');
                expect(args).toContain('4500k');
                expect(args).toContain('-bufsize');
                expect(args).toContain('9000k'); // 2倍自動補完
            });

            it('Combination 4: NVENC encoder with CRF (converted to -cq, videoBitrate excluded, tune ignored)', () => {
                const args = buildFFmpegArgs(
                    {
                        codec: 'hevc_nvenc',
                        preset: 'p4',
                        tune: 'animation', // CPU向けtuneは無視されるべき
                        crf: 26,
                    },
                    mediaInfo1440,
                );

                expect(args).toContain('-c:v');
                expect(args).toContain('hevc_nvenc');
                expect(args).toContain('-preset');
                expect(args).toContain('p4');
                expect(args).toContain('-cq');
                expect(args).toContain('26');
                expect(args).not.toContain('-tune');
                expect(args).not.toContain('animation');
                expect(args).not.toContain('-b:v');
            });

            it('Combination 5: 480p and 540p scaling normalization from 1440x1080', () => {
                const args480 = buildFFmpegArgs({ maxHeight: 480 }, mediaInfo1440);
                // 1440x1080 -> 16:9 480p は 854x480
                expect(args480).toContain('yadif,scale=854:480,setsar=1/1');

                const args540 = buildFFmpegArgs({ maxHeight: 540 }, mediaInfo1440);
                // 1440x1080 -> 16:9 540p は 960x540
                expect(args540).toContain('yadif,scale=960:540,setsar=1/1');
            });
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

        it('should build VAAPI hardware encoding arguments with 1440p scale_vaapi', () => {
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
            expect(args).toContain('deinterlace_vaapi,scale_vaapi=w=1920:h=1080,setsar=1/1');
            expect(args).toContain('-c:v');
            expect(args).toContain('h264_vaapi');
            expect(args).toContain('-b:v');
            expect(args).toContain('4500k');
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
            const activeEncFiles = files.filter(f => f.startsWith('enc') && f.endsWith('.js') && f !== 'enc_helper.js');

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
