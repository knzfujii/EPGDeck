import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import EventSetter from '../../src/model/event/EventSetter.js';

describe('EventSetter Unit Tests', () => {
    let dummyLogger: any;
    let dummyEpgUpdateEvent: any;
    let dummyEncodeEvent: any;
    let dummyRuleEvent: any;
    let dummyReserveEvent: any;
    let dummyRecordingEvent: any;
    let dummyRecordedTagEvent: any;
    let dummyRecordedEvent: any;
    let dummyThumbnailEvent: any;
    let dummyReservationManage: any;
    let dummyRecordingManage: any;
    let dummyRecordedManage: any;
    let dummyRecordedTagManage: any;
    let dummyThumbnailManage: any;
    let dummyExternalCommandManage: any;
    let dummyIpc: any;
    let dummyConfig: any;

    let epgUpdateCallback: () => Promise<void>;
    let ruleCallbacks: Record<string, (id: number) => void>;
    let reserveCallbacks: Record<string, (diff: any) => void>;
    let recordingCallbacks: Record<string, (...args: any[]) => any>;
    let recordedCallbacks: Record<string, (...args: any[]) => any>;
    let recordedTagCallbacks: Record<string, (...args: any[]) => any>;
    let thumbnailCallbacks: Record<string, (...args: any[]) => any>;
    let encodeCallbacks: Record<string, (...args: any[]) => any>;

    let setter: EventSetter;

    beforeEach(() => {
        dummyLogger = {
            getLogger: () => ({
                system: { info: vi.fn(), error: vi.fn(), fatal: vi.fn() },
            }),
        };

        ruleCallbacks = {};
        reserveCallbacks = {};
        recordingCallbacks = {};
        recordedCallbacks = {};
        recordedTagCallbacks = {};
        thumbnailCallbacks = {};
        encodeCallbacks = {};

        dummyEpgUpdateEvent = {
            setUpdated: vi.fn(cb => {
                epgUpdateCallback = cb;
            }),
        };

        dummyRuleEvent = {
            setAdded: vi.fn(cb => {
                ruleCallbacks.added = cb;
            }),
            setUpdated: vi.fn(cb => {
                ruleCallbacks.updated = cb;
            }),
            setEnabled: vi.fn(cb => {
                ruleCallbacks.enabled = cb;
            }),
            setDisabled: vi.fn(cb => {
                ruleCallbacks.disabled = cb;
            }),
            setDeleted: vi.fn(cb => {
                ruleCallbacks.deleted = cb;
            }),
        };

        dummyReserveEvent = {
            setUpdated: vi.fn(cb => {
                reserveCallbacks.updated = cb;
            }),
        };

        dummyRecordingEvent = {
            setStartPrepRecording: vi.fn(cb => {
                recordingCallbacks.startPrep = cb;
            }),
            setCancelPrepRecording: vi.fn(cb => {
                recordingCallbacks.cancelPrep = cb;
            }),
            setPrepRecordingFailed: vi.fn(cb => {
                recordingCallbacks.prepFailed = cb;
            }),
            setStartRecording: vi.fn(cb => {
                recordingCallbacks.startRecording = cb;
            }),
            setRecordingFailed: vi.fn(cb => {
                recordingCallbacks.recordingFailed = cb;
            }),
            setRecordingRetryOver: vi.fn(cb => {
                recordingCallbacks.retryOver = cb;
            }),
            setFinishRecording: vi.fn(cb => {
                recordingCallbacks.finishRecording = cb;
            }),
            setEventRelay: vi.fn(cb => {
                recordingCallbacks.eventRelay = cb;
            }),
        };

        dummyRecordedEvent = {
            setDeleteRecorded: vi.fn(cb => {
                recordedCallbacks.deleteRecorded = cb;
            }),
            setUpdateVideoFileSize: vi.fn(cb => {
                recordedCallbacks.updateVideoFileSize = cb;
            }),
            setAddVideoFile: vi.fn(cb => {
                recordedCallbacks.addVideoFile = cb;
            }),
            setCreateNewRecorded: vi.fn(cb => {
                recordedCallbacks.createNewRecorded = cb;
            }),
            setAddUploadedVideoFile: vi.fn(cb => {
                recordedCallbacks.addUploadedVideoFile = cb;
            }),
            setDeleteVideoFile: vi.fn(cb => {
                recordedCallbacks.deleteVideoFile = cb;
            }),
            setChangeProtect: vi.fn(cb => {
                recordedCallbacks.changeProtect = cb;
            }),
        };

        dummyRecordedTagEvent = {
            setCreated: vi.fn(cb => {
                recordedTagCallbacks.created = cb;
            }),
            setUpdated: vi.fn(cb => {
                recordedTagCallbacks.updated = cb;
            }),
            setRelated: vi.fn(cb => {
                recordedTagCallbacks.related = cb;
            }),
            setDeleted: vi.fn(cb => {
                recordedTagCallbacks.deleted = cb;
            }),
            setDeletedRelation: vi.fn(cb => {
                recordedTagCallbacks.deletedRelation = cb;
            }),
        };

        dummyThumbnailEvent = {
            setAdded: vi.fn(cb => {
                thumbnailCallbacks.added = cb;
            }),
            setDeleted: vi.fn(cb => {
                thumbnailCallbacks.deleted = cb;
            }),
        };

        dummyEncodeEvent = {
            setFinishEncode: vi.fn(cb => {
                encodeCallbacks.finishEncode = cb;
            }),
        };

        dummyReservationManage = {
            updateAll: vi.fn().mockResolvedValue(undefined),
            updateRule: vi.fn().mockResolvedValue(undefined),
            cancel: vi.fn().mockResolvedValue(undefined),
            addEventRelay: vi.fn().mockResolvedValue(undefined),
        };
        dummyRecordingManage = {
            update: vi.fn().mockResolvedValue(undefined),
        };
        dummyRecordedManage = {
            historyCleanup: vi.fn().mockResolvedValue(undefined),
            removeRuleId: vi.fn().mockResolvedValue(undefined),
        };
        dummyRecordedTagManage = {
            setRelation: vi.fn().mockResolvedValue(undefined),
        };
        dummyThumbnailManage = {
            add: vi.fn(),
        };
        dummyExternalCommandManage = {
            addUpdateReserves: vi.fn(),
            addRecordingPrepStartCmd: vi.fn(),
            addRecordingPrepRecFailedCmd: vi.fn(),
            addRecordingStartCmd: vi.fn(),
            addRecordingFailedCmd: vi.fn(),
            addRecordingFinishCmd: vi.fn(),
            addEncodingFinishCmd: vi.fn(),
        };
        dummyIpc = {
            notifyClient: vi.fn(),
            setEncode: vi.fn(),
        };
        dummyConfig = {
            getConfig: () => ({
                recording: {
                    directories: [{ name: 'defaultStorage' }],
                },
            }),
        };

        setter = new EventSetter(
            dummyLogger,
            dummyEpgUpdateEvent,
            dummyEncodeEvent,
            dummyRuleEvent,
            dummyReserveEvent,
            dummyRecordingEvent,
            dummyRecordedTagEvent,
            dummyRecordedEvent,
            dummyThumbnailEvent,
            dummyReservationManage,
            dummyRecordingManage,
            dummyRecordedManage,
            dummyRecordedTagManage,
            dummyThumbnailManage,
            dummyExternalCommandManage,
            dummyIpc,
            dummyConfig,
        );

        setter.set();
    });

    describe('EPG Update Event', () => {
        it('cleans history and triggers updateAll (true on first call, false on subsequent)', async () => {
            await epgUpdateCallback();
            expect(dummyRecordedManage.historyCleanup).toHaveBeenCalledTimes(1);
            expect(dummyReservationManage.updateAll).toHaveBeenCalledWith(true);

            await epgUpdateCallback();
            expect(dummyRecordedManage.historyCleanup).toHaveBeenCalledTimes(2);
            expect(dummyReservationManage.updateAll).toHaveBeenCalledWith(false);
        });
    });

    describe('Rule Events', () => {
        it('notifies client and updates rule when rule added/updated/enabled/disabled', () => {
            ruleCallbacks.added(1);
            expect(dummyIpc.notifyClient).toHaveBeenCalled();
            expect(dummyReservationManage.updateRule).toHaveBeenCalledWith(1);

            ruleCallbacks.updated(2);
            expect(dummyReservationManage.updateRule).toHaveBeenCalledWith(2);

            ruleCallbacks.enabled(3);
            expect(dummyReservationManage.updateRule).toHaveBeenCalledWith(3);

            ruleCallbacks.disabled(4);
            expect(dummyReservationManage.updateRule).toHaveBeenCalledWith(4);
        });

        it('removes ruleId from recorded and updates reservation when rule deleted', () => {
            ruleCallbacks.deleted(5);
            expect(dummyIpc.notifyClient).toHaveBeenCalled();
            expect(dummyRecordedManage.removeRuleId).toHaveBeenCalledWith(5);
            expect(dummyReservationManage.updateRule).toHaveBeenCalledWith(5);
        });
    });

    describe('Reserve Events', () => {
        it('updates recording manage and dispatches external command on reserve updated', () => {
            const diff = { added: [], updated: [], deleted: [] };
            reserveCallbacks.updated(diff);

            expect(dummyIpc.notifyClient).toHaveBeenCalled();
            expect(dummyRecordingManage.update).toHaveBeenCalledWith(diff);
            expect(dummyExternalCommandManage.addUpdateReserves).toHaveBeenCalledWith(diff);
        });
    });

    describe('Recording Events', () => {
        it('handles startPrep and cancelPrep events', () => {
            const reserve: any = { id: 10 };
            recordingCallbacks.startPrep(reserve);
            expect(dummyIpc.notifyClient).toHaveBeenCalled();
            expect(dummyExternalCommandManage.addRecordingPrepStartCmd).toHaveBeenCalledWith(reserve);

            recordingCallbacks.cancelPrep(reserve);
            expect(dummyExternalCommandManage.addRecordingPrepRecFailedCmd).toHaveBeenCalledWith(reserve);
        });

        it('handles prepFailed event with reservation cancellation', () => {
            const reserve: any = { id: 10 };
            recordingCallbacks.prepFailed(reserve);
            expect(dummyIpc.notifyClient).toHaveBeenCalled();
            expect(dummyReservationManage.cancel).toHaveBeenCalledWith(10);
            expect(dummyExternalCommandManage.addRecordingPrepRecFailedCmd).toHaveBeenCalledWith(reserve);
        });

        it('handles startRecording and parses tag associations', async () => {
            const reserve: any = { id: 10, tags: JSON.stringify([101, 102]) };
            const recorded: any = { id: 20 };

            await recordingCallbacks.startRecording(reserve, recorded);
            expect(dummyRecordedTagManage.setRelation).toHaveBeenCalledWith(101, 20);
            expect(dummyRecordedTagManage.setRelation).toHaveBeenCalledWith(102, 20);
            expect(dummyIpc.notifyClient).toHaveBeenCalled();
            expect(dummyExternalCommandManage.addRecordingStartCmd).toHaveBeenCalledWith(recorded);
        });

        it('handles startRecording with invalid tag JSON gracefully', async () => {
            const reserve: any = { id: 10, tags: '{bad json}' };
            const recorded: any = { id: 20 };

            await recordingCallbacks.startRecording(reserve, recorded);
            expect(dummyRecordedTagManage.setRelation).not.toHaveBeenCalled();
            expect(dummyIpc.notifyClient).toHaveBeenCalled();
        });

        it('handles recordingFailed event', () => {
            const recorded: any = { id: 20 };
            recordingCallbacks.recordingFailed({} as any, recorded);
            expect(dummyIpc.notifyClient).toHaveBeenCalled();
            expect(dummyExternalCommandManage.addRecordingFailedCmd).toHaveBeenCalledWith(recorded);

            // Null recorded
            recordingCallbacks.recordingFailed({} as any, null);
            expect(dummyExternalCommandManage.addRecordingFailedCmd).toHaveBeenCalledTimes(1);
        });

        it('handles recordingRetryOver event', () => {
            recordingCallbacks.retryOver({ id: 99 });
            expect(dummyReservationManage.cancel).toHaveBeenCalledWith(99);
        });

        it('handles finishRecording for manual reservation and triggers encoding, thumbnail, and commands', async () => {
            const reserve: any = {
                id: 10,
                ruleId: null, // manual
                encodeMode1: 'mp4',
                encodeParentDirectoryName1: null,
                encodeDirectory1: null,
                encodeMode2: 'm4a',
                encodeParentDirectoryName2: 'secondary',
                encodeDirectory2: 'music',
                encodeMode3: null,
                isDeleteOriginalAfterEncode: true,
                tags: null,
            };
            const recorded: any = {
                id: 20,
                videoFiles: [{ id: 30 }],
            };

            await recordingCallbacks.finishRecording(reserve, recorded, true);

            // Reservation cleanup
            expect(dummyReservationManage.cancel).toHaveBeenCalledWith(10);

            // Thumbnail creation
            expect(dummyThumbnailManage.add).toHaveBeenCalledWith(30);

            // Encode jobs
            expect(dummyIpc.setEncode).toHaveBeenCalledWith({
                recordedId: 20,
                sourceVideoFileId: 30,
                parentDir: 'defaultStorage', // fallback
                directory: undefined,
                mode: 'mp4',
                removeOriginal: true,
            });
            expect(dummyIpc.setEncode).toHaveBeenCalledWith({
                recordedId: 20,
                sourceVideoFileId: 30,
                parentDir: 'secondary',
                directory: 'music',
                mode: 'm4a',
                removeOriginal: true,
            });

            // External command and notify
            expect(dummyExternalCommandManage.addRecordingFinishCmd).toHaveBeenCalledWith(recorded);
            expect(dummyIpc.notifyClient).toHaveBeenCalled();
        });

        it('handles finishRecording for rule reservation and event relay', async () => {
            const reserve: any = {
                id: 11,
                ruleId: 5,
                isEventRelay: false,
                encodeMode1: null,
                encodeMode2: null,
                encodeMode3: null,
                tags: null,
            };
            const recorded: any = { id: 21, videoFiles: [] };

            await recordingCallbacks.finishRecording(reserve, recorded, true);
            expect(dummyReservationManage.updateRule).toHaveBeenCalledWith(5);

            // If event relay, it cancels reserve instead
            reserve.isEventRelay = true;
            await recordingCallbacks.finishRecording(reserve, recorded, true);
            expect(dummyReservationManage.cancel).toHaveBeenCalledWith(11);
        });

        it('handles eventRelay callback', async () => {
            await recordingCallbacks.eventRelay([
                { programId: 100, parentReserve: { id: 1 } },
                { programId: 101, parentReserve: { id: 2 } },
            ]);

            expect(dummyReservationManage.addEventRelay).toHaveBeenCalledWith(100, { id: 1 });
            expect(dummyReservationManage.addEventRelay).toHaveBeenCalledWith(101, { id: 2 });
        });
    });

    describe('Recorded and Tag Events', () => {
        it('cancels reserve when active recording is deleted', () => {
            recordedCallbacks.deleteRecorded({ isRecording: true, reserveId: 777 });
            expect(dummyIpc.notifyClient).toHaveBeenCalled();
            expect(dummyReservationManage.cancel).toHaveBeenCalledWith(777);

            // Non-recording delete
            recordedCallbacks.deleteRecorded({ isRecording: false, reserveId: 777 });
            expect(dummyReservationManage.cancel).toHaveBeenCalledTimes(1);
        });

        it('creates thumbnail for uploaded video file when requested', () => {
            recordedCallbacks.addUploadedVideoFile(123, true);
            expect(dummyIpc.notifyClient).toHaveBeenCalled();
            expect(dummyThumbnailManage.add).toHaveBeenCalledWith(123);

            recordedCallbacks.addUploadedVideoFile(124, false);
            expect(dummyThumbnailManage.add).toHaveBeenCalledTimes(1);
        });

        it('notifies client for video and tag modifications', () => {
            recordedCallbacks.updateVideoFileSize();
            recordedCallbacks.addVideoFile();
            recordedCallbacks.createNewRecorded();
            recordedCallbacks.deleteVideoFile();
            recordedCallbacks.changeProtect();

            recordedTagCallbacks.created({});
            recordedTagCallbacks.updated(1);
            recordedTagCallbacks.related(1, 2);
            recordedTagCallbacks.deleted(1);
            recordedTagCallbacks.deletedRelation(1, 2);

            thumbnailCallbacks.added(1, 2);
            thumbnailCallbacks.deleted();

            expect(dummyIpc.notifyClient).toHaveBeenCalledTimes(12);
        });
    });

    describe('Encode Events', () => {
        it('dispatches encoding finish external command', () => {
            const encodeInfo: any = { id: 50 };
            encodeCallbacks.finishEncode(encodeInfo);
            expect(dummyExternalCommandManage.addEncodingFinishCmd).toHaveBeenCalledWith(encodeInfo);
        });
    });
});
