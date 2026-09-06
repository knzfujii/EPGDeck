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
        vi.clearAllMocks();

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

    it('should re-extract WebVTT when file mtimeMs changes', async () => {
        const filePath = '/path/to/recorded.mp4';
        mockVideoUtil.getFullFilePathFromId.mockResolvedValue(filePath);
        const statSpy = vi.spyOn(FileUtil, 'stat');
        statSpy.mockResolvedValueOnce({ mtimeMs: 1000 } as any);

        const mockStdout = new EventEmitter();
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = mockStdout;

        const spawnSpy = vi.spyOn(childProcess, 'spawn').mockImplementation(() => {
            process.nextTick(() => {
                mockStdout.emit('data', Buffer.from('WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nHello First\n'));
                mockChild.emit('close', 0);
            });
            return mockChild;
        });

        const vtt1 = await videoApiModel.getVtt(10);
        expect(vtt1).toContain('Hello First');
        expect(spawnSpy).toHaveBeenCalledTimes(1);

        // mtimeMs が更新された場合
        statSpy.mockResolvedValueOnce({ mtimeMs: 2000 } as any);
        const mockStdout2 = new EventEmitter();
        const mockChild2 = new EventEmitter() as any;
        mockChild2.stdout = mockStdout2;

        spawnSpy.mockImplementation(() => {
            process.nextTick(() => {
                mockStdout2.emit('data', Buffer.from('WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nHello Second\n'));
                mockChild2.emit('close', 0);
            });
            return mockChild2;
        });

        const vtt2 = await videoApiModel.getVtt(10);
        expect(vtt2).toContain('Hello Second');
        expect(spawnSpy).toHaveBeenCalledTimes(2);
    });

    it('should evict oldest entry when cache exceeds 100 entries', async () => {
        mockVideoUtil.getFullFilePathFromId.mockImplementation(async (id: number) => `/path/to/${id}.mp4`);
        vi.spyOn(FileUtil, 'stat').mockResolvedValue({ mtimeMs: 1000 } as any);

        const spawnSpy = vi.spyOn(childProcess, 'spawn').mockImplementation(() => {
            const mockStdout = new EventEmitter();
            const mockChild = new EventEmitter() as any;
            mockChild.stdout = mockStdout;
            process.nextTick(() => {
                mockStdout.emit('data', Buffer.from('WEBVTT\n\n'));
                mockChild.emit('close', 0);
            });
            return mockChild;
        });

        // 102 件登録
        for (let i = 1; i <= 102; i++) {
            await videoApiModel.getVtt(i);
        }
        expect(spawnSpy).toHaveBeenCalledTimes(102);

        // 最初のエントリ (id: 1) は破棄されているため再 spawn される
        await videoApiModel.getVtt(1);
        expect(spawnSpy).toHaveBeenCalledTimes(103);

        // 直近のエントリ (id: 102) はキャッシュされているため spawn は増えない
        await videoApiModel.getVtt(102);
        expect(spawnSpy).toHaveBeenCalledTimes(103);
    });
});
