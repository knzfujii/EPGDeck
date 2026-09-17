import * as apid from '../../../../api.js';
import VideoFile from '../../../db/entities/VideoFile.js';
export interface VideoInfo {
    duration: number; // sec
    size: number; // byte
    bitRate: number; // bps
}

export default interface IVideoUtil {
    getFullFilePathFromId(videoFileId: apid.VideoFileId): Promise<string | null>;
    getFullFilePathFromVideoFile(videoFile: VideoFile): string | null;
    getParentDirPath(name: string): string | null;
    getInfo(filePath: string): Promise<VideoInfo>;
}
