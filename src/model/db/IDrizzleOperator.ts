import { DrizzleDB } from '../../db/drizzle';

export default interface IDrizzleOperator {
    getDB(): DrizzleDB;
    checkConnection(): Promise<void>;
    closeConnection(): Promise<void>;
}
