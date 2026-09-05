import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EncodeFinishModel from '../../src/model/service/encode/EncodeFinishModel';
import { FinishEncodeInfo } from '../../src/model/event/IEncodeEvent';

describe('EncodeFinishModel', () => {
    let mockLogger: any;
    let mockSocket: any;
    let mockIpc: any;
    let mockEncodeEvent: any;
    let encodeFinishModel: EncodeFinishModel;

    let registeredListeners: {
        addEncode?: (id: any) => void;
        cancelEncode?: (id: any) => void;
        finishEncode?: (info: FinishEncodeInfo) => Promise<void>;
        errorEncode?: () => void;
        updateEncodeProgress?: () => void;
    } = {};

    beforeEach(() => {
        vi.restoreAllMocks();
        registeredListeners = {};

        mockLogger = {
            getLogger: vi.fn().mockReturnValue({
                encode: {
                    info: vi.fn(),
                    error: vi.fn(),
                    warn: vi.fn(),
                    debug: vi.fn(),
                },
            }),
        };

        mockSocket = {
            notifyClient: vi.fn(),
            notifyUpdateEncodeProgress: vi.fn(),
        };

        mockIpc = {
            recorded: {
                updateVideoFileSize: vi.fn().mockResolvedValue(undefined),
                addVideoFile: vi.fn().mockResolvedValue(100),
                deleteVideoFile: vi.fn().mockResolvedValue(undefined),
            },
            encodeEvent: {
                emitFinishEncode: vi.fn().mockResolvedValue(undefined),
            },
        };

        mockEncodeEvent = {
            setAddEncode: vi.fn().mockImplementation(cb => {
                registeredListeners.addEncode = cb;
            }),
            setCancelEncode: vi.fn().mockImplementation(cb => {
                registeredListeners.cancelEncode = cb;
            }),
            setFinishEncode: vi.fn().mockImplementation(cb => {
                registeredListeners.finishEncode = cb;
            }),
            setErrorEncode: vi.fn().mockImplementation(cb => {
                registeredListeners.errorEncode = cb;
            }),
            setUpdateEncodeProgress: vi.fn().mockImplementation(cb => {
                registeredListeners.updateEncodeProgress = cb;
            }),
        };

        encodeFinishModel = new EncodeFinishModel(mockLogger, mockSocket, mockIpc, mockEncodeEvent);
    });

    it('set() should register all event listeners to encodeEvent', () => {
        encodeFinishModel.set();

        expect(mockEncodeEvent.setAddEncode).toHaveBeenCalledTimes(1);
        expect(mockEncodeEvent.setCancelEncode).toHaveBeenCalledTimes(1);
        expect(mockEncodeEvent.setFinishEncode).toHaveBeenCalledTimes(1);
        expect(mockEncodeEvent.setErrorEncode).toHaveBeenCalledTimes(1);
        expect(mockEncodeEvent.setUpdateEncodeProgress).toHaveBeenCalledTimes(1);
    });

    it('addEncode should notify client and update progress', () => {
        encodeFinishModel.set();
        registeredListeners.addEncode!(1);

        expect(mockSocket.notifyClient).toHaveBeenCalledTimes(1);
        expect(mockSocket.notifyUpdateEncodeProgress).toHaveBeenCalledTimes(1);
    });

    it('cancelEncode should notify client and update progress', () => {
        encodeFinishModel.set();
        registeredListeners.cancelEncode!(2);

        expect(mockSocket.notifyClient).toHaveBeenCalledTimes(1);
        expect(mockSocket.notifyUpdateEncodeProgress).toHaveBeenCalledTimes(1);
    });

    it('errorEncode should notify client and update progress', () => {
        encodeFinishModel.set();
        registeredListeners.errorEncode!();

        expect(mockSocket.notifyClient).toHaveBeenCalledTimes(1);
        expect(mockSocket.notifyUpdateEncodeProgress).toHaveBeenCalledTimes(1);
    });

    it('updateEncodeProgress should notify update progress only', () => {
        encodeFinishModel.set();
        registeredListeners.updateEncodeProgress!();

        expect(mockSocket.notifyClient).not.toHaveBeenCalled();
        expect(mockSocket.notifyUpdateEncodeProgress).toHaveBeenCalledTimes(1);
    });

    describe('finishEncode', () => {
        it('should add encoded video file, notify client and progress, and emit finish event', async () => {
            encodeFinishModel.set();

            const info: FinishEncodeInfo = {
                recordedId: 10,
                videoFileId: 20,
                parentDirName: 'recorded',
                filePath: 'sub/encoded.mp4',
                fullOutputPath: '/path/to/sub/encoded.mp4',
                mode: 'H.264',
                removeOriginal: false,
            };

            await registeredListeners.finishEncode!(info);

            expect(mockIpc.recorded.addVideoFile).toHaveBeenCalledWith({
                recordedId: 10,
                parentDirectoryName: 'recorded',
                filePath: 'sub/encoded.mp4',
                type: 'encoded',
                name: 'H.264',
            });
            expect(mockIpc.recorded.deleteVideoFile).not.toHaveBeenCalled();
            expect(mockSocket.notifyClient).toHaveBeenCalledTimes(1);
            expect(mockSocket.notifyUpdateEncodeProgress).toHaveBeenCalledTimes(1);
            expect(mockIpc.encodeEvent.emitFinishEncode).toHaveBeenCalledWith({
                recordedId: 10,
                videoFileId: 100,
                mode: 'H.264',
            });
        });

        it('should delete original video file if removeOriginal is true', async () => {
            encodeFinishModel.set();

            const info: FinishEncodeInfo = {
                recordedId: 10,
                videoFileId: 20,
                parentDirName: 'recorded',
                filePath: 'sub/encoded.mp4',
                fullOutputPath: '/path/to/sub/encoded.mp4',
                mode: 'H.264',
                removeOriginal: true,
            };

            await registeredListeners.finishEncode!(info);

            expect(mockIpc.recorded.deleteVideoFile).toHaveBeenCalledWith(20, true);
        });

        it('should update video file size if output path is null', async () => {
            encodeFinishModel.set();

            const info: FinishEncodeInfo = {
                recordedId: 10,
                videoFileId: 20,
                parentDirName: 'recorded',
                filePath: null,
                fullOutputPath: null,
                mode: 'H.264',
                removeOriginal: false,
            };

            await registeredListeners.finishEncode!(info);

            expect(mockIpc.recorded.updateVideoFileSize).toHaveBeenCalledWith(20);
            expect(mockIpc.recorded.addVideoFile).not.toHaveBeenCalled();
            expect(mockIpc.encodeEvent.emitFinishEncode).toHaveBeenCalledWith({
                recordedId: 10,
                videoFileId: null,
                mode: 'H.264',
            });
        });
    });
});

