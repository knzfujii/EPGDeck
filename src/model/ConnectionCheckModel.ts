import { inject, injectable } from 'inversify';
import { Client } from 'mirakurun';
import Util from '../util/Util.js';
import IDrizzleOperator from './db/IDrizzleOperator.js';
import IConnectionCheckModel from './IConnectionCheckModel.js';
import ILogger from './ILogger.js';
import ILoggerModel from './ILoggerModel.js';
import IMirakurunClientModel from './IMirakurunClientModel.js';

@injectable()
export default class ConnectionCheckModel implements IConnectionCheckModel {
    private log: ILogger;
    private mirakurunClient: Client;
    private drizzleOperator: IDrizzleOperator;

    constructor(
        @inject('ILoggerModel') logger: ILoggerModel,
        @inject('IMirakurunClientModel') mirakurunClientModel: IMirakurunClientModel,
        @inject('IDrizzleOperator') drizzleOperator: IDrizzleOperator,
    ) {
        this.log = logger.getLogger();
        this.mirakurunClient = mirakurunClientModel.getClient();
        this.drizzleOperator = drizzleOperator;
    }

    /**
     * mirakurun との接続を待つ
     */
    public async checkMirakurun(): Promise<void> {
        while (true) {
            try {
                this.log.system.info('check mirakurun');
                await this.mirakurunClient.getStatus();
                break;
            } catch (err: any) {
                await Util.sleep(1000);
            }
        }
    }

    /**
     * DB との接続を待つ
     */
    public async checkDB(): Promise<void> {
        while (true) {
            try {
                this.log.system.info('check db');
                await this.drizzleOperator.checkConnection();
                break;
            } catch (err: any) {
                await Util.sleep(1000);
            }
        }
    }
}
