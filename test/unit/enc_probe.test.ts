import { describe, it, expect } from 'vitest';
import { QUALITY_PRESETS, resolveQualityConfig, estimateOptimalBitrate } from '../../packages/enc-helper/src/index.js';

describe('enc_probe', () => {
    describe('QUALITY_PRESETS', () => {
        it('should have highest, high, standard, and economy presets', () => {
            expect(QUALITY_PRESETS.highest).toBeDefined();
            expect(QUALITY_PRESETS.high).toBeDefined();
            expect(QUALITY_PRESETS.standard).toBeDefined();
            expect(QUALITY_PRESETS.economy).toBeDefined();
        });

        it('should define higher target bitrates for highest preset', () => {
            expect(QUALITY_PRESETS.highest.minBps).toBe(1300);
            expect(QUALITY_PRESETS.highest.maxBps).toBe(12000);
            expect(QUALITY_PRESETS.highest.crfEquivalent).toBe(20);
        });

        it('should define sensible target bitrates for high preset', () => {
            expect(QUALITY_PRESETS.high.minBps).toBe(880);
            expect(QUALITY_PRESETS.high.maxBps).toBe(8500);
            expect(QUALITY_PRESETS.high.crfEquivalent).toBe(23);
        });

        it('should define economy bitrates appropriately', () => {
            expect(QUALITY_PRESETS.economy.minBps).toBe(650);
            expect(QUALITY_PRESETS.economy.maxBps).toBe(5500);
        });
    });

    describe('resolveQualityConfig', () => {
        it('should resolve preset name strings', () => {
            expect(resolveQualityConfig('highest')).toBe(QUALITY_PRESETS.highest);
            expect(resolveQualityConfig('high')).toBe(QUALITY_PRESETS.high);
            expect(resolveQualityConfig('standard')).toBe(QUALITY_PRESETS.standard);
            expect(resolveQualityConfig('economy')).toBe(QUALITY_PRESETS.economy);
        });

        it('should fallback to high preset for unknown string or undefined', () => {
            expect(resolveQualityConfig(undefined)).toBe(QUALITY_PRESETS.high);
            expect(resolveQualityConfig('unknown_preset')).toBe(QUALITY_PRESETS.high);
        });

        it('should interpolate bitrates for numeric CRF values', () => {
            const conf23 = resolveQualityConfig(23);
            expect(conf23.crfEquivalent).toBe(23);
            expect(conf23.minBps).toBeGreaterThanOrEqual(880);
            expect(conf23.maxBps).toBeGreaterThanOrEqual(7500);

            const conf20 = resolveQualityConfig(20);
            expect(conf20.crfEquivalent).toBe(20);
            expect(conf20.minBps).toBeGreaterThan(conf23.minBps);
            expect(conf20.maxBps).toBeGreaterThan(conf23.maxBps);

            const conf27 = resolveQualityConfig(27);
            expect(conf27.crfEquivalent).toBe(27);
            expect(conf27.minBps).toBe(650);
            expect(conf27.maxBps).toBe(5500);
        });

        it('should clamp out-of-range numeric CRF values', () => {
            const confLow = resolveQualityConfig(15); // 非常な高画質要求
            expect(confLow.minBps).toBe(1300);
            expect(confLow.maxBps).toBe(12000);

            const confHigh = resolveQualityConfig(35); // 極小画質
            expect(confHigh.minBps).toBe(650);
            expect(confHigh.maxBps).toBe(5500);
        });
    });

    describe('estimateOptimalBitrate', () => {
        it('should return safe minimum bitrates when video duration is <= 60 seconds', async () => {
            const res = await estimateOptimalBitrate('/non/existent/file.ts', {
                quality: 'high',
                ffprobePath: '/bin/false',
            });

            // duration=0 なので duration <= 60 のガードが作動する (minBps 880 -> 900k)
            expect(res.videoBitrate).toBe('900k');
            expect(res.maxrate).toBe('1600k');
            expect(res.bufsize).toBe('3200k');
            expect(res.probeCount).toBe(0);
        });

        it('should return safe minimum bitrates for highest preset when video duration is short', async () => {
            const res = await estimateOptimalBitrate('/non/existent/file.ts', {
                quality: 'highest',
                ffprobePath: '/bin/false',
            });

            expect(res.videoBitrate).toBe('1300k');
            expect(res.maxrate).toBe('2600k');
            expect(res.bufsize).toBe('5200k');
            expect(res.probeCount).toBe(0);
        });

        it('should scale down bitrates appropriately for 720p target resolution', async () => {
            const res = await estimateOptimalBitrate('/non/existent/file.ts', {
                quality: 'high',
                targetWidth: 1280,
                targetHeight: 720,
                ffprobePath: '/bin/false',
            });

            // 720p (921600 / 1555200)^0.75 ≈ 0.675
            // 880 * 0.675 ≈ 594k -> 600k
            expect(res.resFactor).toBeCloseTo(0.675, 2);
            expect(res.videoBitrate).toBe('600k');
            expect(res.maxrate).toBe('1100k');
        });

        it('should scale down bitrates appropriately for 480p target resolution', async () => {
            const res = await estimateOptimalBitrate('/non/existent/file.ts', {
                quality: 'high',
                targetWidth: 720,
                targetHeight: 480,
                ffprobePath: '/bin/false',
            });

            // 480p (345600 / 1555200)^0.75 ≈ 0.325
            // 880 * 0.325 ≈ 286k -> 300k
            expect(res.resFactor).toBeCloseTo(0.325, 2);
            expect(res.videoBitrate).toBe('300k');
        });

        it('should scale up bitrates appropriately for 1920x1080 target resolution', async () => {
            const res = await estimateOptimalBitrate('/non/existent/file.ts', {
                quality: 'high',
                targetWidth: 1920,
                targetHeight: 1080,
                ffprobePath: '/bin/false',
            });

            // 1920x1080 (2073600 / 1555200)^0.75 ≈ 1.242
            // 880 * 1.242 ≈ 1093k -> 1100k
            expect(res.resFactor).toBeCloseTo(1.242, 2);
            expect(res.videoBitrate).toBe('1100k');
        });

        it('should return initial probe metadata structure on fallback', async () => {
            const res = await estimateOptimalBitrate('/non/existent/file.ts', {
                quality: 'high',
                ffprobePath: '/bin/false',
            });

            expect(res).toHaveProperty('cv');
            expect(res).toHaveProperty('percentile');
            expect(res).toHaveProperty('qSlope');
            expect(res.percentile).toBe('P75');
        });
    });
});
