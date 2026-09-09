import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import EncodeFileManageModel from '../../src/model/service/encode/EncodeFileManageModel';
import FileUtil from '../../src/util/FileUtil';

describe('EncodeFileManageModel', () => {
    let encodeFileManageModel: EncodeFileManageModel;

    beforeEach(() => {
        vi.restoreAllMocks();
        encodeFileManageModel = new EncodeFileManageModel();
    });

    describe('getFilePath', () => {
        it('should return base output path when file does not exist', async () => {
            // stat throws error (file does not exist)
            vi.spyOn(FileUtil, 'stat').mockRejectedValue(new Error('ENOENT'));

            const result = await encodeFileManageModel.getFilePath('/output/dir', '/input/video.ts', '.mp4');

            expect(result).toBe(path.join('/output/dir', 'video.mp4'));
        });

        it('should increment conflict counter when file already exists on disk', async () => {
            const statSpy = vi.spyOn(FileUtil, 'stat');
            // 最初の video.mp4 は存在し、次の video(1).mp4 は存在しない
            statSpy.mockResolvedValueOnce({} as any).mockRejectedValueOnce(new Error('ENOENT'));

            const result = await encodeFileManageModel.getFilePath('/output/dir', '/input/video.ts', '.mp4');

            expect(result).toBe(path.join('/output/dir', 'video(1).mp4'));
            expect(statSpy).toHaveBeenCalledTimes(2);
        });

        it('should increment conflict counter when file name is already tracked in usedFileNameIndex', async () => {
            vi.spyOn(FileUtil, 'stat').mockRejectedValue(new Error('ENOENT'));

            // 1回目の取得で video.mp4 が使用済みとして登録される
            const first = await encodeFileManageModel.getFilePath('/output/dir', '/input/video.ts', '.mp4');
            expect(first).toBe(path.join('/output/dir', 'video.mp4'));

            // 2回目の取得では、ディスク上に存在しなくても usedFileNameIndex により video(1).mp4 が返る
            const second = await encodeFileManageModel.getFilePath('/output/dir', '/input/video.ts', '.mp4');
            expect(second).toBe(path.join('/output/dir', 'video(1).mp4'));

            // 3回目の取得では video(2).mp4 が返る
            const third = await encodeFileManageModel.getFilePath('/output/dir', '/input/video.ts', '.mp4');
            expect(third).toBe(path.join('/output/dir', 'video(2).mp4'));
        });

        it('should handle conflict resolution when both disk existence and usedFileNameIndex conflict', async () => {
            const statSpy = vi.spyOn(FileUtil, 'stat');
            // ディスク上: video.mp4 (存在), video(1).mp4 (存在しない)
            statSpy.mockResolvedValueOnce({} as any).mockRejectedValueOnce(new Error('ENOENT'));

            const first = await encodeFileManageModel.getFilePath('/output/dir', '/input/video.ts', '.mp4');
            expect(first).toBe(path.join('/output/dir', 'video(1).mp4'));

            // 次に別のリクエストが来た時: video.mp4 はディスクに存在、video(1).mp4 は usedFileNameIndex に存在、video(2).mp4 は存在しない
            statSpy.mockResolvedValueOnce({} as any).mockRejectedValueOnce(new Error('ENOENT'));
            const second = await encodeFileManageModel.getFilePath('/output/dir', '/input/video.ts', '.mp4');
            expect(second).toBe(path.join('/output/dir', 'video(2).mp4'));
        });
    });

    describe('release', () => {
        it('should remove file path from usedFileNameIndex so it can be reused', async () => {
            vi.spyOn(FileUtil, 'stat').mockRejectedValue(new Error('ENOENT'));

            const path1 = await encodeFileManageModel.getFilePath('/output/dir', '/input/video.ts', '.mp4');
            expect(path1).toBe(path.join('/output/dir', 'video.mp4'));

            // 解放する
            encodeFileManageModel.release(path1);

            // 再度同じ名前が取得可能になる
            const path2 = await encodeFileManageModel.getFilePath('/output/dir', '/input/video.ts', '.mp4');
            expect(path2).toBe(path.join('/output/dir', 'video.mp4'));
        });
    });
});
