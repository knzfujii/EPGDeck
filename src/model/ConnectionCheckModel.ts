import { inject, injectable } from 'inversify';
import mirakurun from 'mirakurun';
import Util from '../util/Util';
import IDrizzleOperator from './db/IDrizzleOperator';
import IConnectionCheckModel from './IConnectionCheckModel';
import ILogger from './ILogger';
import ILoggerModel from './ILoggerModel';
import IMirakurunClientModel from './IMirakurunClientModel';

@injectable()
export default class ConnectionCheckModel implements IConnectionCheckModel {
    private log: ILogger;
    private mirakurunClient: mirakurun;
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
