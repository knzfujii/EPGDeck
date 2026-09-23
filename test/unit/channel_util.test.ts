import { describe, it, expect } from 'vitest';
import ChannelUtil from '../../src/util/ChannelUtil.js';

describe('ChannelUtil Unit Tests', () => {
    describe('isMediaService', () => {
        it('identifies media services according to ARIB service types', () => {
            // 0x01: デジタルTVサービス
            expect(ChannelUtil.isMediaService(0x01)).toBe(true);
            // 0x02: デジタル音声サービス
            expect(ChannelUtil.isMediaService(0x02)).toBe(true);
            // 0xa1: 臨時映像サービス
            expect(ChannelUtil.isMediaService(0xa1)).toBe(true);
            // 0xa2: 臨時音声サービス
            expect(ChannelUtil.isMediaService(0xa2)).toBe(true);
            // 0xa5: プロモーション映像サービス
            expect(ChannelUtil.isMediaService(0xa5)).toBe(true);
            // 0xa6: プロモーション音声サービス
            expect(ChannelUtil.isMediaService(0xa6)).toBe(true);
            // 0xad: 超高精細度4K専用TVサービス
            expect(ChannelUtil.isMediaService(0xad)).toBe(true);
        });

        it('returns false for data services and unknown service types', () => {
            // 0xc0: データサービス
            expect(ChannelUtil.isMediaService(0xc0)).toBe(false);
            // 0x00: 未定義
            expect(ChannelUtil.isMediaService(0x00)).toBe(false);
            // 0xff
            expect(ChannelUtil.isMediaService(0xff)).toBe(false);
        });
    });
});
