import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import FileUtil from '../../src/util/FileUtil.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testRoot = path.join(__dirname, '../../tmp/test_file_util');

describe('FileUtil Unit Tests', () => {
    beforeEach(async () => {
        if (fs.existsSync(testRoot)) {
            fs.rmSync(testRoot, { recursive: true, force: true });
        }
        await FileUtil.mkdir(testRoot);
    });

    afterEach(() => {
        if (fs.existsSync(testRoot)) {
            fs.rmSync(testRoot, { recursive: true, force: true });
        }
    });

    describe('mkdir and directory checks', () => {
        it('recursively creates directories', async () => {
            const deepDir = path.join(testRoot, 'sub', 'deep', 'folder');
            expect(fs.existsSync(deepDir)).toBe(false);
            await FileUtil.mkdir(deepDir);
            expect(fs.existsSync(deepDir)).toBe(true);
        });

        it('detects empty and non-empty directories', async () => {
            const emptyDir = path.join(testRoot, 'empty');
            await FileUtil.mkdir(emptyDir);
            expect(await FileUtil.isEmptyDirectory(emptyDir)).toBe(true);

            await FileUtil.writeFile(path.join(emptyDir, 'file.txt'), 'content');
            expect(await FileUtil.isEmptyDirectory(emptyDir)).toBe(false);
        });

        it('removes an empty directory with rmdir', async () => {
            const dir = path.join(testRoot, 'to_remove');
            await FileUtil.mkdir(dir);
            expect(fs.existsSync(dir)).toBe(true);
            await FileUtil.rmdir(dir);
            expect(fs.existsSync(dir)).toBe(false);
        });
    });

    describe('file read and write operations', () => {
        it('writes and reads file contents', async () => {
            const file = path.join(testRoot, 'test.txt');
            await FileUtil.writeFile(file, 'Hello EPGDeck');
            const content = await FileUtil.readFile(file);
            expect(content).toBe('Hello EPGDeck');
        });

        it('appends text to an existing file', async () => {
            const file = path.join(testRoot, 'append.txt');
            await FileUtil.writeFile(file, 'Part 1');
            await FileUtil.appendFile(file, ' - Part 2');
            const content = await FileUtil.readFile(file);
            expect(content).toBe('Part 1 - Part 2');
        });

        it('touches a new empty file', async () => {
            const file = path.join(testRoot, 'touched.txt');
            await FileUtil.touchFile(file);
            expect(fs.existsSync(file)).toBe(true);
            expect(await FileUtil.getFileSize(file)).toBe(0);
        });
    });

    describe('file inspection (stat, size, access)', () => {
        it('returns accurate file size', async () => {
            const file = path.join(testRoot, 'sized.txt');
            await FileUtil.writeFile(file, '1234567890');
            const size = await FileUtil.getFileSize(file);
            expect(size).toBe(10);
        });

        it('throws FileIsNotFound when getting size of non-existent file', async () => {
            const nonExistent = path.join(testRoot, 'missing.txt');
            await expect(FileUtil.getFileSize(nonExistent)).rejects.toThrow('FileIsNotFound');
        });

        it('checks access mode', async () => {
            const file = path.join(testRoot, 'accessible.txt');
            await FileUtil.writeFile(file, 'data');
            await expect(FileUtil.access(file, fs.constants.R_OK)).resolves.toBeUndefined();
            await expect(FileUtil.access(path.join(testRoot, 'nope'), fs.constants.R_OK)).rejects.toThrow();
        });
    });

    describe('file manipulation (copy, move, rename, unlink)', () => {
        it('copies file to destination', async () => {
            const src = path.join(testRoot, 'source.txt');
            const dest = path.join(testRoot, 'dest.txt');
            await FileUtil.writeFile(src, 'copy test');
            await FileUtil.copyFile(src, dest);

            expect(fs.existsSync(src)).toBe(true);
            expect(fs.existsSync(dest)).toBe(true);
            expect(await FileUtil.readFile(dest)).toBe('copy test');
        });

        it('moves file to destination removing the original', async () => {
            const src = path.join(testRoot, 'move_src.txt');
            const dest = path.join(testRoot, 'move_dest.txt');
            await FileUtil.writeFile(src, 'move test');
            await FileUtil.move(src, dest);

            expect(fs.existsSync(src)).toBe(false);
            expect(fs.existsSync(dest)).toBe(true);
            expect(await FileUtil.readFile(dest)).toBe('move test');
        });

        it('renames file', async () => {
            const src = path.join(testRoot, 'old.txt');
            const dest = path.join(testRoot, 'new.txt');
            await FileUtil.writeFile(src, 'rename test');
            await FileUtil.rename(src, dest);

            expect(fs.existsSync(src)).toBe(false);
            expect(fs.existsSync(dest)).toBe(true);
            expect(await FileUtil.readFile(dest)).toBe('rename test');
        });

        it('does not unlink existing dest when rename fails', async () => {
            const nonExistentSrc = path.join(testRoot, 'missing_src.txt');
            const dest = path.join(testRoot, 'pre_existing_dest.txt');
            await FileUtil.writeFile(dest, 'keep me');

            // 存在しない src からの rename は失敗するが、既存の dest を消してはならない
            await expect(FileUtil.rename(nonExistentSrc, dest)).rejects.toThrow();
            expect(fs.existsSync(dest)).toBe(true);
            expect(await FileUtil.readFile(dest)).toBe('keep me');
        });

        it('falls back to copy and unlink on EXDEV error during move', async () => {
            const src = path.join(testRoot, 'exdev_src.txt');
            const dest = path.join(testRoot, 'exdev_dest.txt');
            await FileUtil.writeFile(src, 'cross-device move test');

            const exdevErr = new Error('EXDEV: cross-device link not permitted') as any;
            exdevErr.code = 'EXDEV';

            const renameSpy = vi.spyOn(FileUtil, 'rename').mockRejectedValueOnce(exdevErr);

            try {
                await FileUtil.move(src, dest);
                expect(renameSpy).toHaveBeenCalledWith(src, dest);
            } finally {
                renameSpy.mockRestore();
            }

            expect(fs.existsSync(src)).toBe(false);
            expect(fs.existsSync(dest)).toBe(true);
            expect(await FileUtil.readFile(dest)).toBe('cross-device move test');
        });

        it('falls back to copy and unlink on EPERM error (Windows cross-drive) during move', async () => {
            const src = path.join(testRoot, 'eperm_src.txt');
            const dest = path.join(testRoot, 'eperm_dest.txt');
            await FileUtil.writeFile(src, 'windows cross-drive test');

            const epermErr = new Error('EPERM: operation not permitted, rename') as any;
            epermErr.code = 'EPERM';

            const renameSpy = vi.spyOn(FileUtil, 'rename').mockRejectedValueOnce(epermErr);

            try {
                await FileUtil.move(src, dest);
                expect(renameSpy).toHaveBeenCalledWith(src, dest);
            } finally {
                renameSpy.mockRestore();
            }

            expect(fs.existsSync(src)).toBe(false);
            expect(fs.existsSync(dest)).toBe(true);
            expect(await FileUtil.readFile(dest)).toBe('windows cross-drive test');
        });

        it('cleans up incomplete dest and preserves src when copy fails during EXDEV fallback', async () => {
            const src = path.join(testRoot, 'fail_src.txt');
            const dest = path.join(testRoot, 'fail_dest.txt');
            await FileUtil.writeFile(src, 'important data');

            const exdevErr = new Error('EXDEV: cross-device link not permitted') as any;
            exdevErr.code = 'EXDEV';

            const renameSpy = vi.spyOn(FileUtil, 'rename').mockRejectedValueOnce(exdevErr);
            const copySpy = vi.spyOn(FileUtil, 'copyFile').mockImplementation(async (_s, d) => {
                // 部分コピーをシミュレート
                await FileUtil.writeFile(d, 'incomplete');
                throw new Error('ENOSPC: no space left on device');
            });

            try {
                await expect(FileUtil.move(src, dest)).rejects.toThrow('ENOSPC');
            } finally {
                renameSpy.mockRestore();
                copySpy.mockRestore();
            }

            // 元データ src は保護されていること
            expect(fs.existsSync(src)).toBe(true);
            expect(await FileUtil.readFile(src)).toBe('important data');
            // 不完全な dest はクリーンアップされていること
            expect(fs.existsSync(dest)).toBe(false);
        });

        it('unlinks file', async () => {
            const file = path.join(testRoot, 'to_unlink.txt');
            await FileUtil.writeFile(file, 'trash');
            await FileUtil.unlink(file);
            expect(fs.existsSync(file)).toBe(false);
        });
    });

    describe('directory listing and recursive scanning', () => {
        it('lists direct children with readDir', async () => {
            await FileUtil.writeFile(path.join(testRoot, 'a.txt'), '');
            await FileUtil.writeFile(path.join(testRoot, 'b.txt'), '');
            const files = await FileUtil.readDir(testRoot);
            expect(files.sort()).toEqual(['a.txt', 'b.txt']);
        });

        it('recursively gathers files and directories skipping dotfiles', async () => {
            const subDir = path.join(testRoot, 'sub');
            await FileUtil.mkdir(subDir);
            await FileUtil.writeFile(path.join(testRoot, 'root.txt'), '');
            await FileUtil.writeFile(path.join(testRoot, '.hidden'), ''); // dotfile should be skipped
            await FileUtil.writeFile(path.join(subDir, 'child.txt'), '');

            const list = await FileUtil.getFileList(testRoot);
            expect(list.directories).toContain(subDir);
            expect(list.files).toContain(path.join(testRoot, 'root.txt'));
            expect(list.files).toContain(path.join(subDir, 'child.txt'));
            expect(list.files).not.toContain(path.join(testRoot, '.hidden'));
        });
    });
});
