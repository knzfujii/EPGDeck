import * as apid from '../../../../api.js';

export default interface IStorageApiModel {
    getInfo(): Promise<apid.StorageInfo>;
}
