import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import RecordingApiModel from '../../src/model/api/recording/RecordingApiModel.js';

describe('RecordingApiModel Unit Tests', () => {
    let dummyIpc: any;
    let dummyRecordedDB: any;
    let dummyRecordedItemUtil: any;
    let model: RecordingApiModel;

    beforeEach(() => {
        dummyIpc = {
            recording: {
                resetTimer: vi.fn().mockResolvedValue(undefined),
                finish: vi.fn().mockResolvedValue(undefined),
                stop: vi.fn().mockResolvedValue(undefined),
                discard: vi.fn().mockResolvedValue(undefined),
            },
        };
        dummyRecordedDB = {
            findAll: vi.fn().mockResolvedValue([
                [
                    { id: 1, name: 'Recording 1' },
                    { id: 2, name: 'Recording 2' },
                ],
                2,
            ]),
        };
        dummyRecordedItemUtil = {
            convertRecordedToRecordedItem: vi.fn().mockImplementation((r, isHalfWidth) => ({
                id: r.id,
                name: isHalfWidth ? `Half_${r.name}` : r.name,
            })),
        };

        model = new RecordingApiModel(dummyIpc, dummyRecordedDB, dummyRecordedItemUtil);
    });

    describe('gets', () => {
        it('fetches currently recording programs with isRecording flag set', async () => {
            const option: any = { isHalfWidth: false, limit: 10, offset: 0 };
            const result = await model.gets(option);

            expect(dummyRecordedDB.findAll).toHaveBeenCalledWith(
                expect.objectContaining({ isRecording: true, limit: 10, offset: 0 }),
                {
                    isNeedVideoFiles: true,
                    isNeedThumbnails: true,
                    isNeedsDropLog: false,
                    isNeedTags: false,
                },
            );

            expect(result.total).toBe(2);
            expect(result.records).toHaveLength(2);
            expect(result.records[0]).toEqual({ id: 1, name: 'Recording 1' });
            expect(result.records[1]).toEqual({ id: 2, name: 'Recording 2' });
        });

        it('converts records with half-width option if requested', async () => {
            const option: any = { isHalfWidth: true };
            const result = await model.gets(option);

            expect(result.records[0]).toEqual({ id: 1, name: 'Half_Recording 1' });
            expect(dummyRecordedItemUtil.convertRecordedToRecordedItem).toHaveBeenCalledWith(expect.anything(), true);
        });
    });

    describe('timer and recording control methods', () => {
        it('delegates resetTimer to IPC client', async () => {
            await model.resetTimer();
            expect(dummyIpc.recording.resetTimer).toHaveBeenCalledTimes(1);
        });

        it('delegates finish to IPC client with reserveId', async () => {
            await model.finish(123);
            expect(dummyIpc.recording.finish).toHaveBeenCalledWith(123);
        });

        it('delegates stop to IPC client with reserveId', async () => {
            await model.stop(456);
            expect(dummyIpc.recording.stop).toHaveBeenCalledWith(456);
        });

        it('delegates discard to IPC client with reserveId', async () => {
            await model.discard(789);
            expect(dummyIpc.recording.discard).toHaveBeenCalledWith(789);
        });
    });
});
