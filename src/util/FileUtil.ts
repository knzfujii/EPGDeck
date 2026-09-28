import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

export interface FileList {
    files: string[];
    directories: string[];
}

/**
 * unlink
 * @param filePath: file path
 */
export const unlink = async (filePath: string): Promise<void> => {
    await fsp.unlink(filePath);
};

/**
 * access
 * @param filePath: file path
 * @param mode: mode
 */
export const access = async (filePath: string, mode?: number): Promise<void> => {
    await fsp.access(filePath, mode);
};

/**
 * mkdir
 * @param dirPath: dir path
 */
export const mkdir = async (dirPath: string): Promise<void> => {
    await fsp.mkdir(dirPath, { recursive: true });
};

/**
 * stat
 * @param filePath: file path
 * @return Promise<fs.Stats>
 */
export const stat = async (filePath: string): Promise<fs.Stats> => {
    return await fsp.stat(filePath);
};

/**
 * ファイルサイズ取得
 * @param filePath: string
 * @return Promise<number>
 * @throws FileIsNotFound
 */
export const getFileSize = async (filePath: string): Promise<number> => {
    try {
        return (await FileUtil.stat(filePath)).size;
    } catch {
        throw new Error('FileIsNotFound');
    }
};

/**
 * 指定されたディレクトリのファイル一覧を返す
 * @param dirPath: string ディレクトリパス
 * @return Promise<string[]> ファイル一覧
 */
export const readDir = async (dirPath: string): Promise<string[]> => {
    return await fsp.readdir(dirPath);
};

/**
 * 指定したファイルを一括で読み取る
 * @param filePath: string
 * @return Promise<string>
 */
export const readFile = async (filePath: string): Promise<string> => {
    return await fsp.readFile(filePath, 'utf-8');
};

/**
 * 指定したファイルに書き込む (新規作成 or 上書き)
 * @param filePath: string
 * @param data: string
 * @return Promise<void>
 */
export const writeFile = async (filePath: string, data: string): Promise<void> => {
    await fsp.writeFile(filePath, data);
};

/**
 * Promise file rename
 * @param src: source file path
 * @param dest: dest file path
 * @return Promise<void>
 */
export const rename = async (src: string, dest: string): Promise<void> => {
    await fsp.rename(src, dest);
};

/**
 * Promise file copy
 * @param src: source file path
 * @param dest: dest file path
 * @return Promise<void>
 */
export const copyFile = async (src: string, dest: string): Promise<void> => {
    await fsp.copyFile(src, dest);
};

/**
 * Promise file move (rename 優先、EXDEV 時 copy + unlink にフォールバック)
 * @param src: source file path
 * @param dest: dest file path
 * @return Promise<void>
 */
export const move = async (src: string, dest: string): Promise<void> => {
    try {
        // 同一ファイルシステムであれば rename による高速・アトミック移動
        await FileUtil.rename(src, dest);
        return;
    } catch (err: any) {
        // クロスデバイス移動 (EXDEV / Windows cross-drive EPERM) 以外は即座にエラー送出
        if (err.code !== 'EXDEV' && err.code !== 'EPERM') {
            throw err;
        }
    }

    // 別デバイス・マウントポイント間の場合は copy + unlink にフォールバック
    try {
        await FileUtil.copyFile(src, dest);
    } catch (err: any) {
        // コピー失敗時は不完全な dest ファイルを掃除
        await FileUtil.unlink(dest).catch(() => {});
        throw err;
    }

    // コピー成功後に元ファイルを削除
    await FileUtil.unlink(src);
};

/**
 * touch file
 * @param file: string
 * @return Promise<void>
 */
export const touchFile = async (file: string): Promise<void> => {
    await fsp.writeFile(file, '');
};

/**
 * 指定したファイルに追加
 * @param file: string file path
 * @param str: string 追記内容
 * @return Promise<void>
 */
export const appendFile = async (file: string, str: string): Promise<void> => {
    await fsp.appendFile(file, str);
};

/**
 * 指定したディレクトリ以下の file と directory 一覧を返す
 * @return Promise<FileList>
 */
export const getFileList = async (fileDir: string): Promise<FileList> => {
    const files = await fsp.readdir(fileDir);
    const results: FileList = {
        files: [],
        directories: [],
    };
    for (const file of files) {
        // 隠しディレクトリ・ファイルはスキップ
        if (file.startsWith('.')) {
            continue;
        }

        const filePath = path.join(fileDir, file);

        try {
            const fileStat = await fsp.stat(filePath);
            if (fileStat.isDirectory()) {
                results.directories.push(filePath);
                try {
                    // sub directory 探索
                    const subFiles = await FileUtil.getFileList(filePath);
                    for (const f of subFiles.files) {
                        results.files.push(f);
                    }
                    for (const d of subFiles.directories) {
                        results.directories.push(d);
                    }
                } catch {
                    // error
                }
            } else {
                results.files.push(filePath);
            }
        } catch {
            continue;
        }
    }

    return results;
};

/**
 * directory が空か
 * @param dir: string
 * @return Promise<boolean>
 */
export const isEmptyDirectory = async (dir: string): Promise<boolean> => {
    const files = await fsp.readdir(dir);
    return files.length === 0;
};

/**
 * ディレクトリを削除
 * @param dir: string
 * @return Promise<void>
 */
export const rmdir = async (dir: string): Promise<void> => {
    await fsp.rmdir(dir);
};

export const FileUtil = {
    unlink,
    access,
    mkdir,
    stat,
    getFileSize,
    readDir,
    readFile,
    writeFile,
    rename,
    copyFile,
    move,
    touchFile,
    appendFile,
    getFileList,
    isEmptyDirectory,
    rmdir,
};

// 型参照の後方互換性（FileUtil.FileList）を担保
export namespace FileUtil {
    export type FileList = _FileList;
}
type _FileList = FileList;

export default FileUtil;
