import * as apid from '../../../api.js';

export default interface IThumbnailEvent {
    emitAdded(videoFileId: apid.VideoFileId, recordedId: apid.RecordedId): void;
    emitDeleted(): void;
    setAdded(callback: (videoFileId: apid.VideoFileId, recordedId: apid.RecordedId) => void): void;
    setDeleted(callback: () => void): void;
}
