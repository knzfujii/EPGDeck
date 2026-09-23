import { inject, injectable } from 'inversify';
import * as apid from '../../../../api.js';
import IRuleDB from '../../db/IRuleDB.js';
import IRuleEvent from '../../event/IRuleEvent.js';
import ILogger from '../../ILogger.js';
import ILoggerModel from '../../ILoggerModel.js';
import { IPromiseQueue } from '../../IPromiseQueue.js';
import IReserveOptionChecker from '../IReserveOptionChecker.js';
import IRuleManageModel from './IRuleManageModel.js';

@injectable()
export default class RuleManageModel implements IRuleManageModel {
    private log: ILogger;
    private optionChecker: IReserveOptionChecker;
    private ruleDB: IRuleDB;
    private ruleEvent: IRuleEvent;
    private queue: IPromiseQueue;

    constructor(
        @inject('ILoggerModel') logger: ILoggerModel,
        @inject('IReserveOptionChecker') optionChecker: IReserveOptionChecker,
        @inject('IRuleDB') ruleDB: IRuleDB,
        @inject('IRuleEvent') ruleEvent: IRuleEvent,
        @inject('IPromiseQueue') queue: IPromiseQueue,
    ) {
        this.log = logger.getLogger();
        this.optionChecker = optionChecker;
        this.ruleDB = ruleDB;
        this.ruleEvent = ruleEvent;
        this.queue = queue;
    }

    /**
     * ルールの追加
     * @param rule: apid.AddRuleOption
     * @return Promise<apid.Rule>
     */
    public async add(rule: apid.AddRuleOption): Promise<apid.RuleId> {
        return this.queue.add(async () => {
            this.log.system.info('add rule');

            this.sanitizeRule(rule);

            // check option
            if (this.optionChecker.checkRuleOption(rule) === false) {
                this.log.system.error('failed to add rule');
                throw new Error('AddRuleError');
            }

            let ruleId!: apid.RuleId;
            try {
                ruleId = await this.ruleDB.insertOnce(rule);
            } catch (err: any) {
                this.log.system.error('insert rule error');
                this.log.system.error(err);
                throw err;
            }

            this.log.system.info(`rule added successfully: ${ruleId}`);

            // 通知
            this.ruleEvent.emitAdded(ruleId);

            return ruleId;
        });
    }

    /**
     * ルールの更新
     * @param rule: apid.Rule
     */
    public async update(rule: apid.Rule): Promise<void> {
        return this.queue.add(async () => {
            // rule が存在するか確認
            const oldRule = await this.ruleDB.findId(rule.id).catch(err => {
                this.log.system.error(err);
                throw err;
            });

            if (oldRule === null) {
                throw new Error('RuleIsNotFound');
            }

            this.log.system.info(`update rule: ${rule.id}`);

            this.sanitizeRule(rule);

            // check option
            if (this.optionChecker.checkRuleOption(rule) === false) {
                this.log.system.error('failed to update rule');
                throw new Error('UpdateRuleError');
            }

            // rule 更新
            try {
                await this.ruleDB.updateOnce(rule);
            } catch (err: any) {
                this.log.system.error(`update rule error: ${rule.id}`);
                throw err;
            }
            this.log.system.info(`rule updated successfully: ${rule.id}`);

            // 通知
            this.ruleEvent.emitUpdated(rule.id);
        });
    }

    /**
     * ルール有効化
     * @param ruleId: rule id
     */
    public async enable(ruleId: apid.RuleId): Promise<void> {
        return this.queue.add(async () => {
            this.log.system.info(`enable rule: ${ruleId}`);

            try {
                await this.ruleDB.enableOnce(ruleId);
            } catch (err: any) {
                this.log.system.error(`enable rule error: ${ruleId}`);
                throw err;
            }

            this.log.system.info(`rule enabled successfully: ${ruleId}`);

            // 通知
            this.ruleEvent.emitEnabled(ruleId);
        });
    }

    /**
     * ルール無効化
     * @param ruleId: rule id
     */
    public async disable(ruleId: apid.RuleId): Promise<void> {
        return this.queue.add(async () => {
            this.log.system.info(`disable rule: ${ruleId}`);

            try {
                await this.ruleDB.disableOnce(ruleId);
            } catch (err: any) {
                this.log.system.error(`disable rule error: ${ruleId}`);
                throw err;
            }

            this.log.system.info(`rule disabled successfully: ${ruleId}`);

            // 通知
            this.ruleEvent.emitDisabled(ruleId);
        });
    }

    /**
     * ルール削除
     * @param ruleId: rule id
     */
    public async delete(ruleId: apid.RuleId): Promise<void> {
        return this.queue.add(async () => {
            this.log.system.info(`delete rule: ${ruleId}`);

            try {
                await this.ruleDB.deleteOnce(ruleId);
            } catch (err: any) {
                this.log.system.error(`delete rule error: ${ruleId}`);
                throw err;
            }

            this.log.system.info(`rule deleted successfully: ${ruleId}`);

            // 通知
            this.ruleEvent.emitDeleted(ruleId);
        });
    }

    /**
     * ルール複数削除
     * @param ruleIds: rule ids
     * @return Promise<apid.RuleId[]> 削除出来なかった ruleId を返す
     */
    public async deletes(ruleIds: apid.RuleId[]): Promise<apid.RuleId[]> {
        const failedIds: apid.RuleId[] = [];

        this.log.system.info('deletes rule');
        for (const ruleId of ruleIds) {
            try {
                await this.delete(ruleId);
            } catch (err: any) {
                failedIds.push(ruleId);
            }
        }

        return failedIds;
    }

    /**
     * searchOption の keyword / ignoreKeyword を正規化
     */
    private sanitizeRule(rule: apid.AddRuleOption | apid.Rule): void {
        if (rule.searchOption) {
            if (typeof rule.searchOption.keyword === 'string') {
                const trimmed = rule.searchOption.keyword.trim();
                if (trimmed.length === 0) {
                    delete rule.searchOption.keyword;
                } else {
                    rule.searchOption.keyword = trimmed;
                }
            }
            if (typeof rule.searchOption.ignoreKeyword === 'string') {
                const trimmed = rule.searchOption.ignoreKeyword.trim();
                if (trimmed.length === 0) {
                    delete rule.searchOption.ignoreKeyword;
                } else {
                    rule.searchOption.ignoreKeyword = trimmed;
                }
            }
        }
    }
}
