import * as apid from '../../../../api.js';

export default interface IThumbnailApiModel {
    getIdFilePath(thumbnailId: apid.ThumbnailId): Promise<string | null>;
    regenerate(): Promise<void>;
    fileCleanup(): Promise<void>;
    add(videoFileId: apid.VideoFileId, option?: { seconds?: number; replace?: boolean }): Promise<void>;
    delete(thumbnailId: apid.ThumbnailId): Promise<void>;
}
