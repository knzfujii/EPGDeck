import { injectable } from 'inversify';
import mirakurun from 'mirakurun';
import IMirakurunClientModel from '../../src/model/IMirakurunClientModel';

/**
 * E2E テスト・CI 環境向けの完全密閉型（Hermetic）Mirakurun クライアントモック
 */
@injectable()
export default class MockMirakurunClientModel implements IMirakurunClientModel {
    private dummyClient: mirakurun;

    constructor() {
        this.dummyClient = {
            getStatus: async () =>
                ({
                    version: '3.9.0-mock',
                    process: {
                        arch: 'x64',
                        platform: 'linux',
                        versions: {},
                        env: {},
                        pid: 1,
                        memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0 },
                    },
                    epg: {
                        gatheringNetworks: [],
                        storedEvents: 0,
                    },
                    streamProviders: [],
                }) as any,
            getChannels: async () => [],
            getServices: async () => [],
            getPrograms: async () => [],
            getTuners: async () => [],
            getLogoImage: async () => Buffer.from(''),
        } as unknown as mirakurun;
    }

    public getClient(): mirakurun {
        return this.dummyClient;
    }
}
