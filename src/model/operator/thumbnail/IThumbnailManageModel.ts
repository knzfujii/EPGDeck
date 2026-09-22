import * as apid from '../../../../api.js';

export default interface IThumbnailManageModel {
    add(videoFileId: apid.VideoFileId, seconds?: number, replace?: boolean): void;
    delete(thumbnailId: apid.ThumbnailId): Promise<void>;
    regenerate(): Promise<void>;
    fileCleanup(): Promise<void>;
}
