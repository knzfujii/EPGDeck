import { injectable } from 'inversify';
import IIPCClient, {
    IPCOperatorEncodeEvent,
    IPCRecordedManageModel,
    IPCRecordedTagManageModel,
    IPCRecordingManageModel,
    IPCReservationManageModel,
    IPCRuleManageModel,
    IPCThumbnailManageModel,
} from '../../src/model/ipc/IIPCClient';

@injectable()
export default class MockIPCClient implements IIPCClient {
    public reserveation: IPCReservationManageModel = {
        getBroadcastStatus: async () => ({ GR: false, BS: false, CS: false, SKY: false }),
        add: async () => 1,
        update: async () => {},
        updateRule: async () => {},
        updateAll: async () => {},
        cancel: async () => {},
        removeSkip: async () => {},
        removeOverlap: async () => {},
        edit: async () => {},
        clean: async () => {},
    };

    public recorded: IPCRecordedManageModel = {
        delete: async () => {},
        updateVideoFileSize: async () => {},
        addVideoFile: async () => 1,
        addUploadedVideoFile: async () => {},
        createNewRecorded: async () => 1,
        deleteVideoFile: async () => {},
        changeProtect: async () => {},
        videoFileCleanup: async () => {},
        dropLogFileCleanup: async () => {},
    };

    public recordedTag: IPCRecordedTagManageModel = {
        create: async () => 1,
        update: async () => {},
        setRelation: async () => {},
        delete: async () => {},
        deleteRelation: async () => {},
    };

    public recording: IPCRecordingManageModel = {
        resetTimer: () => {},
    };

    public rule: IPCRuleManageModel = {
        add: async () => 1,
        update: async () => {},
        enable: async () => {},
        disable: async () => {},
        delete: async () => {},
        deletes: async () => [],
    };

    public thumbnail: IPCThumbnailManageModel = {
        regenerate: async () => {},
        fileCleanup: async () => {},
        add: async () => {},
        delete: async () => {},
    };

    public encodeEvent: IPCOperatorEncodeEvent = {
        emitFinishEncode: async () => {},
    };
}
