import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import IPTVApiModel from '../../src/model/api/iptv/IPTVApiModel.js';

describe('IPTVApiModel Unit Tests', () => {
    let dummyChannelDB: any;
    let dummyProgramDB: any;
    let model: IPTVApiModel;

    beforeEach(() => {
        dummyChannelDB = {
            findAll: vi.fn().mockResolvedValue([]),
        };
        dummyProgramDB = {
            findSchedule: vi.fn().mockResolvedValue([]),
        };

        model = new IPTVApiModel(dummyChannelDB, dummyProgramDB);
    });

    describe('getChannelList', () => {
        it('generates standard M3U playlist with media channels', async () => {
            dummyChannelDB.findAll.mockResolvedValue([
                {
                    id: 1,
                    type: 1,
                    channelType: 'GR',
                    name: 'NHK総合',
                    halfWidthName: 'NHK総合',
                    hasLogoData: true,
                },
                {
                    id: 2,
                    type: 1,
                    channelType: 'GR',
                    name: 'NHK Eテレ',
                    halfWidthName: 'NHK Eテレ',
                    hasLogoData: false,
                },
            ]);

            const m3u = await model.getChannelList('localhost:8888', false, 1, false);

            expect(m3u).toContain('#EXTM3U\n');
            expect(m3u).toContain('#KODIPROP:mimetype=video/mp2t\n');
            // Channel 1 has logo
            expect(m3u).toContain('tvg-logo="http://localhost:8888/api/channels/1/logo" group-title="GR",NHK総合');
            expect(m3u).toContain('http://localhost:8888/api/streams/live/1/m2ts?mode=1\n');
            // Channel 2 has no logo
            expect(m3u).toContain('#EXTINF:-1 tvg-id="2"  group-title="GR",NHK Eテレ');
            expect(m3u).toContain('http://localhost:8888/api/streams/live/2/m2ts?mode=1\n');
        });

        it('handles secure HTTPS and subDirectory in URL generation', async () => {
            dummyChannelDB.findAll.mockResolvedValue([
                {
                    id: 10,
                    type: 1,
                    channelType: 'BS',
                    name: 'BS日テレ',
                    halfWidthName: 'BS日テレ',
                    hasLogoData: true,
                },
            ]);

            const m3u = await model.getChannelList('example.com', true, 2, true, '/epg');

            expect(m3u).toContain('https://example.com/epg/api/channels/10/logo');
            expect(m3u).toContain('https://example.com/epg/api/streams/live/10/m2ts?mode=2');
        });

        it('deduplicates channel names by appending trailing spaces', async () => {
            dummyChannelDB.findAll.mockResolvedValue([
                {
                    id: 101,
                    type: 1,
                    channelType: 'CS',
                    name: 'チャンネルA',
                    halfWidthName: 'ﾁｬﾝﾈﾙA',
                    hasLogoData: false,
                },
                {
                    id: 102,
                    type: 1,
                    channelType: 'CS',
                    name: 'チャンネルA', // duplicate name
                    halfWidthName: 'ﾁｬﾝﾈﾙA',
                    hasLogoData: false,
                },
                {
                    id: 103,
                    type: 0x99, // data service (should be excluded)
                    channelType: 'CS',
                    name: 'データサービス',
                    halfWidthName: 'ﾃﾞｰﾀｻｰﾋﾞｽ',
                    hasLogoData: false,
                },
            ]);

            const m3u = await model.getChannelList('localhost:8888', false, 0, false);

            expect(m3u).toContain(',チャンネルA　\n');
            // Second channel has a single trailing space before ideographic space
            expect(m3u).toContain(',チャンネルA 　\n');
            // Non-media service is excluded
            expect(m3u).not.toContain('データサービス');
        });
    });

    describe('getEpg', () => {
        it('generates valid XMLTV content with escaped characters and combined description', async () => {
            const now = Date.now();
            dummyChannelDB.findAll.mockResolvedValue([
                {
                    id: 1,
                    channel: '27',
                    serviceId: 1024,
                    name: 'NHK＜総合＞',
                    halfWidthName: 'NHK<総合>',
                },
                {
                    id: 2,
                    channel: '28',
                    serviceId: 1025,
                    name: '無番組局',
                    halfWidthName: '無番組局',
                },
            ]);

            dummyProgramDB.findSchedule.mockResolvedValue([
                {
                    id: 100,
                    channelId: 1,
                    startAt: now,
                    endAt: now + 3600000,
                    name: 'ニュース "特集" & \'天気\' <速報>',
                    description: '詳細な説明\x1a & 要約',
                    extended: '【出演者】テスト',
                },
            ]);

            const xml = await model.getEpg(7, false);

            expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
            expect(xml).toContain('<!DOCTYPE tv SYSTEM "xmltv.dtd">');
            expect(xml).toContain('<tv generator-info-name="EPGStation">');
            // Channel 1 included, Channel 2 without programs excluded from XMLTV body
            expect(xml).toContain('<channel id="1" tp="27">');
            expect(xml).toContain('<display-name lang="ja_JP">NHK＜総合＞</display-name>');
            expect(xml).toContain('<service_id>1024</service_id>');
            expect(xml).not.toContain('<channel id="2"');

            // Programme with XML-escaped special characters
            expect(xml).toContain('<title lang="ja_JP">ニュース ”特集” ＆ ’天気’ ＜速報＞</title>');
            // Description + extended concatenated with control chars stripped
            expect(xml).toContain('<desc lang="ja_JP">詳細な説明 ＆ 要約【出演者】テスト</desc>');
        });

        it('handles half-width display names for channels', async () => {
            dummyChannelDB.findAll.mockResolvedValue([
                {
                    id: 1,
                    channel: '27',
                    serviceId: 1024,
                    name: '全角チャンネル',
                    halfWidthName: '半角チャンネル',
                },
            ]);
            dummyProgramDB.findSchedule.mockResolvedValue([
                {
                    id: 100,
                    channelId: 1,
                    startAt: Date.now(),
                    endAt: Date.now() + 1800000,
                    name: '番組',
                    description: null,
                    extended: null,
                },
            ]);

            const xml = await model.getEpg(1, true);

            expect(xml).toContain('<display-name lang="ja_JP">半角チャンネル</display-name>');
            expect(xml).toContain('<title lang="ja_JP">番組</title>');
            expect(xml).not.toContain('<desc');
        });
    });
});
