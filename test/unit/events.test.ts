import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import EPGUpdateEvent from '../../src/model/event/EPGUpdateEvent.js';
import ReserveEvent from '../../src/model/event/ReserveEvent.js';
import RuleEvent from '../../src/model/event/RuleEvent.js';
import RecordingEvent from '../../src/model/event/RecordingEvent.js';
import RecordedEvent from '../../src/model/event/RecordedEvent.js';
import RecordedTagEvent from '../../src/model/event/RecordedTagEvent.js';
import ThumbnailEvent from '../../src/model/event/ThumbnailEvent.js';
import EncodeEvent from '../../src/model/event/EncodeEvent.js';
import OperatorEncodeEvent from '../../src/model/event/OperatorEncodeEvent.js';

describe('Event Models Unit Tests', () => {
    let dummyLogger: any;
    let errorLogSpy: any;

    beforeEach(() => {
        errorLogSpy = vi.fn();
        dummyLogger = {
            getLogger: () => ({
                system: { error: errorLogSpy, info: vi.fn() },
            }),
        };
    });

    describe('EPGUpdateEvent', () => {
        it('emits and receives updated event, and catches callback error', async () => {
            const event = new EPGUpdateEvent(dummyLogger);
            const callback = vi.fn().mockRejectedValue(new Error('epg failed'));

            event.setUpdated(callback);
            event.emitUpdated();

            // Allow async handler to execute
            await new Promise(r => setTimeout(r, 10));

            expect(callback).toHaveBeenCalledTimes(1);
            expect(errorLogSpy).toHaveBeenCalledWith(expect.any(Error));
        });

        it('supports setUpdatedOnce executing only on the first emit', async () => {
            const event = new EPGUpdateEvent(dummyLogger);
            const callback = vi.fn();

            event.setUpdatedOnce(callback);
            event.emitUpdated();
            event.emitUpdated();

            await new Promise(r => setTimeout(r, 10));
            expect(callback).toHaveBeenCalledTimes(1);
        });
    });

    describe('ReserveEvent', () => {
        it('transmits reservation diff payload', async () => {
            const event = new ReserveEvent(dummyLogger);
            const callback = vi.fn();
            const diff: any = { added: [1], updated: [], deleted: [] };

            event.setUpdated(callback);
            event.emitUpdated(diff);

            await new Promise(r => setTimeout(r, 10));
            expect(callback).toHaveBeenCalledWith(diff);
        });
    });

    describe('RuleEvent', () => {
        it('handles rule lifecycle events (add, update, enable, disable, delete)', async () => {
            const event = new RuleEvent(dummyLogger);
            const addedCb = vi.fn();
            const updatedCb = vi.fn();
            const enabledCb = vi.fn();
            const disabledCb = vi.fn();
            const deletedCb = vi.fn();

            event.setAdded(addedCb);
            event.setUpdated(updatedCb);
            event.setEnabled(enabledCb);
            event.setDisabled(disabledCb);
            event.setDeleted(deletedCb);

            event.emitAdded(1);
            event.emitUpdated(2);
            event.emitEnabled(3);
            event.emitDisabled(4);
            event.emitDeleted(5);

            await new Promise(r => setTimeout(r, 10));

            expect(addedCb).toHaveBeenCalledWith(1);
            expect(updatedCb).toHaveBeenCalledWith(2);
            expect(enabledCb).toHaveBeenCalledWith(3);
            expect(disabledCb).toHaveBeenCalledWith(4);
            expect(deletedCb).toHaveBeenCalledWith(5);
        });
    });

    describe('RecordingEvent', () => {
        it('handles recording lifecycle events with full parameter propagation', async () => {
            const event = new RecordingEvent(dummyLogger);
            const startPrepCb = vi.fn();
            const cancelPrepCb = vi.fn();
            const prepFailedCb = vi.fn();
            const startRecCb = vi.fn();
            const recFailedCb = vi.fn();
            const retryOverCb = vi.fn();
            const finishRecCb = vi.fn();
            const eventRelayCb = vi.fn();

            event.setStartPrepRecording(startPrepCb);
            event.setCancelPrepRecording(cancelPrepCb);
            event.setPrepRecordingFailed(prepFailedCb);
            event.setStartRecording(startRecCb);
            event.setRecordingFailed(recFailedCb);
            event.setRecordingRetryOver(retryOverCb);
            event.setFinishRecording(finishRecCb);
            event.setEventRelay(eventRelayCb);

            const reserve: any = { id: 10 };
            const recorded: any = { id: 20 };

            event.emitStartPrepRecording(reserve);
            event.emitCancelPrepRecording(reserve);
            event.emitPrepRecordingFailed(reserve);
            event.emitStartRecording(reserve, recorded);
            event.emitRecordingFailed(reserve, null);
            event.emitRecordingRetryOver(reserve);
            event.emitFinishRecording(reserve, recorded, true);
            event.emitEventRelay([{ programId: 100, parentReserve: reserve }]);

            await new Promise(r => setTimeout(r, 10));

            expect(startPrepCb).toHaveBeenCalledWith(reserve);
            expect(cancelPrepCb).toHaveBeenCalledWith(reserve);
            expect(prepFailedCb).toHaveBeenCalledWith(reserve);
            expect(startRecCb).toHaveBeenCalledWith(reserve, recorded);
            expect(recFailedCb).toHaveBeenCalledWith(reserve, null);
            expect(retryOverCb).toHaveBeenCalledWith(reserve);
            expect(finishRecCb).toHaveBeenCalledWith(reserve, recorded, true);
            expect(eventRelayCb).toHaveBeenCalledWith([{ programId: 100, parentReserve: reserve }]);
        });
    });

    describe('RecordedEvent', () => {
        it('handles recorded video and modification events', async () => {
            const event = new RecordedEvent(dummyLogger);
            const deleteRecordedCb = vi.fn();
            const updateVideoSizeCb = vi.fn();
            const addVideoFileCb = vi.fn();
            const createNewRecordedCb = vi.fn();
            const addUploadedVideoFileCb = vi.fn();
            const deleteVideoFileCb = vi.fn();
            const changeProtectCb = vi.fn();

            event.setDeleteRecorded(deleteRecordedCb);
            event.setUpdateVideoFileSize(updateVideoSizeCb);
            event.setAddVideoFile(addVideoFileCb);
            event.setCreateNewRecorded(createNewRecordedCb);
            event.setAddUploadedVideoFile(addUploadedVideoFileCb);
            event.setDeleteVideoFile(deleteVideoFileCb);
            event.setChangeProtect(changeProtectCb);

            const recorded: any = { id: 100 };
            event.emitDeleteRecorded(recorded);
            event.emitUpdateVideoFileSize(100);
            event.emitAddVideoFile(100);
            event.emitCreateNewRecorded(100);
            event.emitAddUploadedVideoFile(555, true);
            event.emitDeleteVideoFile(555);
            event.emitChangeProtect(100, true);

            await new Promise(r => setTimeout(r, 10));

            expect(deleteRecordedCb).toHaveBeenCalledWith(recorded);
            expect(updateVideoSizeCb).toHaveBeenCalledWith(100);
            expect(addVideoFileCb).toHaveBeenCalledWith(100);
            expect(createNewRecordedCb).toHaveBeenCalledWith(100);
            expect(addUploadedVideoFileCb).toHaveBeenCalledWith(555, true);
            expect(deleteVideoFileCb).toHaveBeenCalledWith(555);
            expect(changeProtectCb).toHaveBeenCalledWith(100, true);
        });
    });

    describe('RecordedTagEvent', () => {
        it('handles tag associations and modifications', async () => {
            const event = new RecordedTagEvent(dummyLogger);
            const createdCb = vi.fn();
            const updatedCb = vi.fn();
            const relatedCb = vi.fn();
            const deletedCb = vi.fn();
            const deletedRelationCb = vi.fn();

            event.setCreated(createdCb);
            event.setUpdated(updatedCb);
            event.setRelated(relatedCb);
            event.setDeleted(deletedCb);
            event.setDeletedRelation(deletedRelationCb);

            const tag: any = { id: 1, name: 'Anime' };
            event.emitCreated(tag);
            event.emitUpdated(1);
            event.emitRelated(1, 100);
            event.emitDeleted(1);
            event.emitDeletedRelation(1, 100);

            await new Promise(r => setTimeout(r, 10));

            expect(createdCb).toHaveBeenCalledWith(tag);
            expect(updatedCb).toHaveBeenCalledWith(1);
            expect(relatedCb).toHaveBeenCalledWith(1, 100);
            expect(deletedCb).toHaveBeenCalledWith(1);
            expect(deletedRelationCb).toHaveBeenCalledWith(1, 100);
        });
    });

    describe('ThumbnailEvent', () => {
        it('handles thumbnail addition and deletion', async () => {
            const event = new ThumbnailEvent(dummyLogger);
            const addedCb = vi.fn();
            const deletedCb = vi.fn();

            event.setAdded(addedCb);
            event.setDeleted(deletedCb);

            event.emitAdded(10, 20);
            event.emitDeleted();

            await new Promise(r => setTimeout(r, 10));

            expect(addedCb).toHaveBeenCalledWith(10, 20);
            expect(deletedCb).toHaveBeenCalledWith();
        });
    });

    describe('EncodeEvent and OperatorEncodeEvent', () => {
        it('handles service-side and operator-side encoding events', async () => {
            const encodeEvent = new EncodeEvent(dummyLogger);
            const operatorEncodeEvent = new OperatorEncodeEvent(dummyLogger);

            const addEncodeCb = vi.fn();
            const cancelEncodeCb = vi.fn();
            const finishEncodeCb = vi.fn();

            encodeEvent.setAddEncode(addEncodeCb);
            encodeEvent.setCancelEncode(cancelEncodeCb);
            operatorEncodeEvent.setFinishEncode(finishEncodeCb);

            const encodeItem: any = { id: 1, mode: 'mp4' };
            encodeEvent.emitAddEncode(encodeItem);
            encodeEvent.emitCancelEncode(1);
            operatorEncodeEvent.emitFinishEncode(encodeItem);

            await new Promise(r => setTimeout(r, 10));

            expect(addEncodeCb).toHaveBeenCalledWith(encodeItem);
            expect(cancelEncodeCb).toHaveBeenCalledWith(1);
            expect(finishEncodeCb).toHaveBeenCalledWith(encodeItem);
        });
    });
});
