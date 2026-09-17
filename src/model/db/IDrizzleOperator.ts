import { DrizzleDB } from '../../db/drizzle.js';

export default interface IDrizzleOperator {
    getDB(): DrizzleDB;
    checkConnection(): Promise<void>;
    closeConnection(): Promise<void>;
}
