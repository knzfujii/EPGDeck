import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import * as childProcess from 'child_process';
import VideoApiModel from '../../src/model/api/video/VideoApiModel';
import FileUtil from '../../src/util/FileUtil';

vi.mock('child_process');

describe('VideoApiModel - getVtt', () => {
    let mockVideoUtil: any;
    let mockConfig: any;
    let videoApiModel: VideoApiModel;

    beforeEach(() => {
        vi.restoreAllMocks();

        mockVideoUtil = {
            getFullFilePathFromId: vi.fn(),
        };

        mockConfig = {
            getConfig: vi.fn().mockReturnValue({
                encode: {
                    binaries: {
                        ffmpeg: '/usr/bin/ffmpeg',
                    },
                },
            }),
        };

        videoApiModel = new VideoApiModel(
            mockConfig,
            {} as any, // videoFileDB
            {} as any, // recordedDB
            {} as any, // apiUtil
            mockVideoUtil,
            {} as any, // ipc
        );
    });

    it('should return null if file path does not exist', async () => {
        mockVideoUtil.getFullFilePathFromId.mockResolvedValue(null);

        const result = await videoApiModel.getVtt(123);
        expect(result).toBeNull();
    });

    it('should extract WebVTT via FFmpeg and cache the result', async () => {
        const filePath = '/path/to/recorded.mp4';
        mockVideoUtil.getFullFilePathFromId.mockResolvedValue(filePath);
        vi.spyOn(FileUtil, 'stat').mockResolvedValue({ mtimeMs: 1000 } as any);

        const mockStdout = new EventEmitter();
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = mockStdout;

        const spawnSpy = vi.spyOn(childProcess, 'spawn').mockImplementation(() => {
            process.nextTick(() => {
                mockStdout.emit('data', Buffer.from('WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nHello World\n'));
                mockChild.emit('close', 0);
            });
            return mockChild;
        });

        // 初回呼び出し: FFmpeg 実行
        const vtt1 = await videoApiModel.getVtt(1);
        expect(vtt1).toContain('WEBVTT');
        expect(vtt1).toContain('Hello World');
        expect(spawnSpy).toHaveBeenCalledTimes(1);

        // 2回目呼び出し (mtimeMs が同一): キャッシュから返却され、spawn は呼ばれない
        const vtt2 = await videoApiModel.getVtt(1);
        expect(vtt2).toBe(vtt1);
        expect(spawnSpy).toHaveBeenCalledTimes(1);
    });

    it('should return empty WEBVTT header when video has no subtitles or FFmpeg exits with error', async () => {
        const filePath = '/path/to/no_sub.mp4';
        mockVideoUtil.getFullFilePathFromId.mockResolvedValue(filePath);
        vi.spyOn(FileUtil, 'stat').mockResolvedValue({ mtimeMs: 2000 } as any);

        const mockStdout = new EventEmitter();
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = mockStdout;

        vi.spyOn(childProcess, 'spawn').mockImplementation(() => {
            process.nextTick(() => {
                // 字幕ストリームが存在しないため終了コード 1
                mockChild.emit('close', 1);
            });
            return mockChild;
        });

        const vtt = await videoApiModel.getVtt(2);
        expect(vtt).toBe('WEBVTT\n\n');
    });

    it('should return empty WEBVTT header on file stat exception', async () => {
        mockVideoUtil.getFullFilePathFromId.mockResolvedValue('/path/to/corrupt.mp4');
        vi.spyOn(FileUtil, 'stat').mockRejectedValue(new Error('ENOENT'));

        const vtt = await videoApiModel.getVtt(3);
        expect(vtt).toBe('WEBVTT\n\n');
    });
});

