import * as path from 'node:path';
import FileUtil from '../../../../util/FileUtil.js';
import ILogger from '../../../ILogger.js';
import ILoggerModel from '../../../ILoggerModel.js';
import IHLSFileDeleterModel, { HLSFileDeleterOption } from './IHLSFileDeleterModel.js';

export default class HLSFileDeleterModel implements IHLSFileDeleterModel {
    private log: ILogger;
    private option: HLSFileDeleterOption | null = null;

    constructor(logger: ILoggerModel) {
        this.log = logger.getLogger();
    }

    /**
     * 削除オプション設定
     * @param option: HLSFileDeleterOption
     */
    public setOption(option: HLSFileDeleterOption): void {
        this.option = option;
    }

    /**
     * 全てのファイルを削除する
     */
    public async deleteAllFiles(): Promise<void> {
        if (this.option === null) {
            throw new Error('HLSFileDeleterOptionIsNull');
        }

        this.log.stream.info(`delete all hls files: ${this.option.streamId}`);
        await this.deleteFile(0);
    }

    /**
     * ファイルの削除
     * @param fileNum: 残すファイル数 0 なら全て削除
     * @return Promise<void>;
     */
    private async deleteFile(fileNum: number): Promise<void> {
        if (this.option === null) {
            throw new Error('HLSFileDeleterOptionIsNull');
        }

        const option: HLSFileDeleterOption = this.option;

        let targetFiles = (await FileUtil.readDir(this.option.streamFilePath)).filter(file => {
            return (
                (fileNum === 0 && file.match('.m3u8') && file.match(`stream${option.streamId}`)) ||
                file.match(`stream${option.streamId}`)
            );
        });

        targetFiles = targetFiles.sort();

        for (let i = 0; i < targetFiles.length - fileNum; i++) {
            const fileName = targetFiles[i];
            if (typeof fileName !== 'undefined' && fileName !== '.gitkeep') {
                const targetPath = path.join(this.option.streamFilePath, fileName);
                try {
                    await FileUtil.unlink(targetPath);
                    this.log.stream.info(`deleted ${fileName}`);
                } catch (err: any) {
                    // 既に ffmpeg 等により先行削除されている場合は正常としてスルー
                    if (err?.code !== 'ENOENT') {
                        this.log.stream.warn(`failed to delete ${fileName}: ${err?.message}`);
                    }
                }
            }
        }
    }
}
