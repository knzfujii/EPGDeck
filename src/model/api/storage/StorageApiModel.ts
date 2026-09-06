import * as fs from 'fs';
import { inject, injectable } from 'inversify';
import * as apid from '../../../../api';
import IConfigFile from '../../IConfigFile';
import IConfiguration from '../../IConfiguration';
import IStorageApiModel from './IStorageApiModel';

@injectable()
export default class StorageApiModel implements IStorageApiModel {
    private config: IConfigFile;

    constructor(@inject('IConfiguration') configuration: IConfiguration) {
        this.config = configuration.getConfig();
    }

    /**
     * recorded のディスク情報を返す
     * @return Promise<apid.StorageInfo>
     */
    public async getInfo(): Promise<apid.StorageInfo> {
        const items: apid.StorageItem[] = [];

        for (const r of this.config.recording.directories) {
            const info = await this.getDiskInfo(r.path);
            (info as apid.StorageItem).name = r.name;
            items.push(info as apid.StorageItem);
        }

        return {
            items: items,
        };
    }

    /**
     * 指定したディレクトリのディスク使用情報を取得する
     * @param dirPath ディスクディレクトリ
     */
    private async getDiskInfo(dirPath: string): Promise<apid.DiskUsage> {
        const stats = await fs.promises.statfs(dirPath);
        const total = stats.blocks * stats.bsize;
        const available = stats.bavail * stats.bsize;
        const free = stats.bfree * stats.bsize;
        const used = Math.max(0, total - free);

        return {
            available,
            used,
            total,
        };
    }
}
