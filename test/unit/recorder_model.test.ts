import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Reserve from '../../src/db/entities/Reserve.js';
import RecorderModel from '../../src/model/operator/recording/RecorderModel.js';
import RecordingUtilModel from '../../src/model/operator/recording/RecordingUtilModel.js';

describe('RecorderModel createRecorded & RecordingUtilModel Tests', () => {
    let dummyLogger: any;
    let dummyConfig: any;
    let dummyProgramDB: any;
    let dummyChannelDB: any;

    beforeEach(() => {
        vi.restoreAllMocks();

        dummyLogger = {
            getLogger: () => ({
                system: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
                stream: { fatal: vi.fn() },
            }),
        };

        dummyConfig = {
            getConfig: () => ({
                recording: {
                    directories: [{ name: 'main', path: '/recorded' }],
                    filenameFormat: '%TITLE%',
                    fileExtension: '.m2ts',
                },
            }),
        };

        dummyProgramDB = {
            findChannelIdAndTime: vi.fn(),
        };

        dummyChannelDB = {
            findId: vi.fn().mockResolvedValue({
                id: 1,
                name: 'Ch1',
                halfWidthName: 'Ch1',
                serviceId: 101,
                channelType: 'GR',
                channel: '27',
            }),
        };
    });

    const createRecorder = (reserve: Reserve) => {
        const recorder = new RecorderModel(
            dummyLogger,
            dummyConfig,
            dummyProgramDB,
            {} as any, // reserveDB
            {} as any, // recordedDB
            {} as any, // recordedHistoryDB
            {} as any, // videoFileDB
            {} as any, // dropLogFileDB
            {} as any, // streamCreator
            {} as any, // dropChecker
            {} as any, // recordingUtil
            {} as any, // recordingEvent
            {} as any, // mirakurunClientModel
        );

        (recorder as any).reserve = reserve;
        (recorder as any).isRecording = false;

        return recorder;
    };

    describe('RecorderModel.createRecorded', () => {
        it('should use program name from EPG when program is found for time-specified reservation', async () => {
            const reserve = new Reserve();
            reserve.id = 1;
            reserve.isTimeSpecified = true;
            reserve.name = 'ユーザー指定タイトル（aaa）';
            reserve.halfWidthName = 'ユーザー指定タイトル（aaa）';
            reserve.channelId = 1;
            reserve.startAt = 1000;
            reserve.endAt = 2000;

            dummyProgramDB.findChannelIdAndTime.mockResolvedValue({
                name: '実際に放送された番組名（ニュース）',
                halfWidthName: '実際に放送された番組名（ニュース）',
                description: '番組詳細',
                halfWidthDescription: '番組詳細',
            });

            const recorder = createRecorder(reserve);
            const recorded = await (recorder as any).createRecorded();

            expect(recorded.name).toBe('実際に放送された番組名（ニュース）');
            expect(recorded.description).toBe('番組詳細');
        });

        it('should fallback to reserve name when program is NOT found in EPG for time-specified reservation', async () => {
            const reserve = new Reserve();
            reserve.id = 2;
            reserve.isTimeSpecified = true;
            reserve.name = 'aaa';
            reserve.halfWidthName = 'aaa';
            reserve.channelId = 1;
            reserve.startAt = 1000;
            reserve.endAt = 2000;

            // EPG に番組が存在しない
            dummyProgramDB.findChannelIdAndTime.mockResolvedValue(null);

            const recorder = createRecorder(reserve);
            const recorded = await (recorder as any).createRecorded();

            // 空文字ではなく予約時のタイトル 'aaa' にフォールバックされること
            expect(recorded.name).toBe('aaa');
            expect(recorded.halfWidthName).toBe('aaa');
        });
    });

    describe('RecordingUtilModel.formatFilePathString', () => {
        it('should fallback to reserve name when program is NOT found in EPG for time-specified reservation', async () => {
            const util = new RecordingUtilModel(
                dummyLogger,
                dummyConfig,
                {} as any,
                dummyChannelDB,
                dummyProgramDB,
                {} as any,
                {} as any,
            );

            const reserve = new Reserve();
            reserve.id = 3;
            reserve.isTimeSpecified = true;
            reserve.name = 'aaa';
            reserve.channelId = 1;
            reserve.startAt = new Date('2026-09-21T10:00:00+09:00').getTime();
            reserve.endAt = new Date('2026-09-21T10:30:00+09:00').getTime();

            dummyProgramDB.findChannelIdAndTime.mockResolvedValue(null);

            const formatted = await util.formatFilePathString('%YEAR%_%TITLE%', reserve);
            expect(formatted).toBe('2026_aaa');
        });

        it('should use program name when found in EPG for time-specified reservation', async () => {
            const util = new RecordingUtilModel(
                dummyLogger,
                dummyConfig,
                {} as any,
                dummyChannelDB,
                dummyProgramDB,
                {} as any,
                {} as any,
            );

            const reserve = new Reserve();
            reserve.id = 4;
            reserve.isTimeSpecified = true;
            reserve.name = 'aaa';
            reserve.channelId = 1;
            reserve.startAt = new Date('2026-09-21T10:00:00+09:00').getTime();
            reserve.endAt = new Date('2026-09-21T10:30:00+09:00').getTime();

            dummyProgramDB.findChannelIdAndTime.mockResolvedValue({
                name: '実際の番組名',
            });

            const formatted = await util.formatFilePathString('%YEAR%_%TITLE%', reserve);
            expect(formatted).toBe('2026_実際の番組名');
        });
    });
});
