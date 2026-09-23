import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Channel from '../../src/db/entities/Channel.js';
import Program from '../../src/db/entities/Program.js';
import ScheduleApiModel from '../../src/model/api/schedule/ScheduleApiModel.js';

describe('ScheduleApiModel Tests', () => {
    let dummyChannelDB: any;
    let dummyProgramDB: any;
    let model: ScheduleApiModel;

    beforeEach(() => {
        dummyChannelDB = {
            findId: vi.fn(),
            findAll: vi.fn(),
            findChannelTypes: vi.fn(),
        };
        dummyProgramDB = {
            findId: vi.fn(),
            findSchedule: vi.fn(),
            findBroadcasting: vi.fn(),
            findRule: vi.fn(),
        };
        model = new ScheduleApiModel(dummyChannelDB, dummyProgramDB);
    });

    const createDummyProgram = (id: number, channelId: number): Program => {
        const p = new Program();
        p.id = id;
        p.channelId = channelId;
        p.eventId = 100 + id;
        p.serviceId = 200;
        p.networkId = 1;
        p.startAt = 1000;
        p.endAt = 2000;
        p.startHour = 4;
        p.name = 'テスト番組　１';
        p.halfWidthName = 'テスト番組 1';
        p.description = '詳細説明　１';
        p.halfWidthDescription = '詳細説明 1';
        p.extended = '拡張情報　１';
        p.halfWidthExtended = '拡張情報 1';
        p.rawExtended = JSON.stringify({ 出演者: '山田太郎' });
        p.rawHalfWidthExtended = JSON.stringify({ 出演者: '山田太郎' });
        p.genre1 = 1;
        p.subGenre1 = 0;
        p.genre2 = 2;
        p.subGenre2 = 1;
        p.genre3 = 3;
        p.subGenre3 = 2;
        p.videoType = 'mpeg2';
        p.videoResolution = '1080i';
        p.videoStreamContent = 1;
        p.videoComponentType = 17;
        p.audioSamplingRate = 48000;
        p.audioComponentType = 2;
        p.isFree = true;
        return p;
    };

    const createDummyChannel = (id: number, channelType: string): Channel => {
        const c = new Channel();
        c.id = id;
        c.serviceId = 200 + id;
        c.networkId = 1;
        c.name = `局名\u3000${id}`;
        c.halfWidthName = `局名 ${id}`;
        c.hasLogoData = true;
        c.channelType = channelType as any;
        c.channel = `${id}`;
        c.type = 1;
        c.remoteControlKeyId = 1;
        return c;
    };

    describe('getSchedule', () => {
        it('returns null when program is not found', async () => {
            dummyProgramDB.findId.mockResolvedValue(null);

            const result = await model.getSchedule(999, false);
            expect(result).toBeNull();
            expect(dummyProgramDB.findId).toHaveBeenCalledWith(999);
        });

        it('returns full-width program item with rawExtended parsed when isHalfWidth = false', async () => {
            const p = createDummyProgram(1, 10);
            dummyProgramDB.findId.mockResolvedValue(p);

            const result = await model.getSchedule(1, false);
            expect(result).not.toBeNull();
            expect(result?.id).toBe(1);
            expect(result?.name).toBe('テスト番組　１');
            expect(result?.description).toBe('詳細説明　１');
            expect(result?.extended).toBe('拡張情報　１');
            expect(result?.rawExtended).toEqual({ 出演者: '山田太郎' });
            expect(result?.genre1).toBe(1);
            expect(result?.subGenre1).toBe(0);
            expect(result?.genre2).toBe(2);
            expect(result?.subGenre2).toBe(1);
            expect(result?.genre3).toBe(3);
            expect(result?.subGenre3).toBe(2);
            expect(result?.videoType).toBe('mpeg2');
            expect(result?.videoResolution).toBe('1080i');
            expect(result?.audioSamplingRate).toBe(48000);
            expect(result?.isFree).toBe(true);
        });

        it('returns half-width program item when isHalfWidth = true', async () => {
            const p = createDummyProgram(2, 10);
            dummyProgramDB.findId.mockResolvedValue(p);

            const result = await model.getSchedule(2, true);
            expect(result?.name).toBe('テスト番組 1');
            expect(result?.description).toBe('詳細説明 1');
            expect(result?.extended).toBe('拡張情報 1');
        });

        it('safely handles corrupted rawExtended JSON without throwing', async () => {
            const p = createDummyProgram(3, 10);
            p.rawExtended = '{ broken json ';
            dummyProgramDB.findId.mockResolvedValue(p);

            const result = await model.getSchedule(3, false);
            expect(result?.rawExtended).toBeUndefined();
        });
    });

    describe('getSchedules', () => {
        it('throws GetScheduleTypesError when all wave types are disabled', async () => {
            await expect(
                model.getSchedules({
                    GR: false,
                    BS: false,
                    CS: false,
                    SKY: false,
                    startAt: 1000,
                    endAt: 2000,
                    isHalfWidth: false,
                }),
            ).rejects.toThrow('GetScheduleTypesError');
        });

        it('collects specified types and groups programs by channel', async () => {
            const ch1 = createDummyChannel(1, 'GR');
            const ch2 = createDummyChannel(2, 'BS');
            const p1 = createDummyProgram(101, 1);
            const p2 = createDummyProgram(102, 1);

            dummyChannelDB.findChannelTypes.mockResolvedValue([ch1, ch2]);
            dummyProgramDB.findSchedule.mockResolvedValue([p1, p2]);

            const schedules = await model.getSchedules({
                GR: true,
                BS: true,
                CS: false,
                SKY: false,
                startAt: 1000,
                endAt: 5000,
                isHalfWidth: false,
                needsRawExtended: true,
            });

            expect(dummyChannelDB.findChannelTypes).toHaveBeenCalledWith(['GR', 'BS'], true);
            expect(dummyProgramDB.findSchedule).toHaveBeenCalledWith({
                startAt: 1000,
                endAt: 5000,
                isHalfWidth: false,
                types: ['GR', 'BS'],
                isFree: undefined,
            });

            // ch1 は番組2件、ch2 は番組0件のため除外されること
            expect(schedules.length).toBe(1);
            expect(schedules[0].channel.id).toBe(1);
            expect(schedules[0].channel.name).toBe('局名　1');
            expect(schedules[0].programs.length).toBe(2);
            expect(schedules[0].programs[0].id).toBe(101);
            expect(schedules[0].programs[1].id).toBe(102);
            expect(schedules[0].programs[0].rawExtended).toEqual({ 出演者: '山田太郎' });
        });

        it('does not include rawExtended when needsRawExtended is false', async () => {
            const ch1 = createDummyChannel(1, 'GR');
            const p1 = createDummyProgram(101, 1);

            dummyChannelDB.findChannelTypes.mockResolvedValue([ch1]);
            dummyProgramDB.findSchedule.mockResolvedValue([p1]);

            const schedules = await model.getSchedules({
                GR: true,
                BS: false,
                CS: false,
                SKY: false,
                startAt: 1000,
                endAt: 2000,
                isHalfWidth: true,
                needsRawExtended: false,
            });

            expect(schedules.length).toBe(1);
            expect(schedules[0].channel.name).toBe('局名 1');
            expect(schedules[0].programs[0].rawExtended).toBeUndefined();
        });
    });

    describe('getChannelSchedule', () => {
        it('throws ChannelIsNotFound when channel does not exist', async () => {
            dummyChannelDB.findId.mockResolvedValue(null);

            await expect(
                model.getChannelSchedule({
                    channelId: 999,
                    startAt: 1000,
                    days: 1,
                    isHalfWidth: false,
                }),
            ).rejects.toThrow('ChannelIsNotFound');
        });

        it('fetches schedule day by day for specified days', async () => {
            const ch = createDummyChannel(1, 'GR');
            ch.remoteControlKeyId = null; // null パターンもテスト
            dummyChannelDB.findId.mockResolvedValue(ch);

            const pDay1 = createDummyProgram(101, 1);
            const pDay2 = createDummyProgram(102, 1);

            dummyProgramDB.findSchedule.mockResolvedValueOnce([pDay1]).mockResolvedValueOnce([pDay2]);

            const startAt = 1000000;
            const oneDayMs = 24 * 60 * 60 * 1000;

            const schedules = await model.getChannelSchedule({
                channelId: 1,
                startAt: startAt,
                days: 2,
                isHalfWidth: false,
                needsRawExtended: true,
            });

            expect(dummyProgramDB.findSchedule).toHaveBeenCalledTimes(2);
            expect(dummyProgramDB.findSchedule).toHaveBeenNthCalledWith(1, {
                startAt: startAt,
                endAt: startAt + oneDayMs,
                isHalfWidth: false,
                channelId: 1,
                isFree: undefined,
            });
            expect(dummyProgramDB.findSchedule).toHaveBeenNthCalledWith(2, {
                startAt: startAt + oneDayMs,
                endAt: startAt + oneDayMs * 2,
                isHalfWidth: false,
                channelId: 1,
                isFree: undefined,
            });

            expect(schedules.length).toBe(2);
            expect(schedules[0].channel.id).toBe(1);
            expect(schedules[0].channel.remoteControlKeyId).toBeUndefined();
            expect(schedules[0].programs.length).toBe(1);
            expect(schedules[0].programs[0].id).toBe(101);
            expect(schedules[1].programs.length).toBe(1);
            expect(schedules[1].programs[0].id).toBe(102);
        });
    });

    describe('getBroadcastingSchedule', () => {
        it('fetches broadcasting programs and truncates to maximum 1 program per channel', async () => {
            const ch1 = createDummyChannel(1, 'GR');
            const ch2 = createDummyChannel(2, 'GR');
            const p1 = createDummyProgram(101, 1);
            const p2 = createDummyProgram(102, 1); // 同一チャンネルに2件
            const p3 = createDummyProgram(103, 2);

            dummyChannelDB.findAll.mockResolvedValue([ch1, ch2]);
            dummyProgramDB.findBroadcasting.mockResolvedValue([p1, p2, p3]);

            const schedules = await model.getBroadcastingSchedule({
                isHalfWidth: false,
            });

            expect(dummyChannelDB.findAll).toHaveBeenCalledWith(true);
            expect(dummyProgramDB.findBroadcasting).toHaveBeenCalledWith({ isHalfWidth: false });

            expect(schedules.length).toBe(2);
            // ch1 は複数あったが先頭1件に制限されること
            expect(schedules[0].channel.id).toBe(1);
            expect(schedules[0].programs.length).toBe(1);
            expect(schedules[0].programs[0].id).toBe(101);

            expect(schedules[1].channel.id).toBe(2);
            expect(schedules[1].programs.length).toBe(1);
            expect(schedules[1].programs[0].id).toBe(103);
        });
    });

    describe('search', () => {
        it('searches programs via programDB.findRule and maps to schedule items', async () => {
            const p1 = createDummyProgram(201, 1);
            const p2 = createDummyProgram(202, 2);
            dummyProgramDB.findRule.mockResolvedValue([p1, p2]);

            const searchOption: any = { keyword: 'アニメ' };
            const results = await model.search(searchOption, true, 10);

            expect(dummyProgramDB.findRule).toHaveBeenCalledWith({
                searchOption: searchOption,
                limit: 10,
            });
            expect(results.length).toBe(2);
            expect(results[0].id).toBe(201);
            expect(results[0].name).toBe('テスト番組 1');
            expect(results[1].id).toBe(202);
            expect(results[1].name).toBe('テスト番組 1');
        });
    });
});
