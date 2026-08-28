import { createClient, Client } from '@libsql/client';
import { drizzle as drizzleLibSql, LibSQLDatabase } from 'drizzle-orm/libsql';
import { drizzle as drizzleMysql2, MySql2Database } from 'drizzle-orm/mysql2';
import * as mysql from 'mysql2/promise';
import * as path from 'path';
import IConfigFile from '../model/IConfigFile';
import * as mysqlSchema from './schema/mysql';
import * as sqliteSchema from './schema/sqlite';

export type DrizzleSqliteDB = LibSQLDatabase<typeof sqliteSchema>;
export type DrizzleMysqlDB = MySql2Database<typeof mysqlSchema>;

export type DrizzleDB =
    | {
          type: 'sqlite';
          db: DrizzleSqliteDB;
          rawClient: Client;
          schema: typeof sqliteSchema;
      }
    | {
          type: 'mysql';
          db: DrizzleMysqlDB;
          pool: mysql.Pool;
          schema: typeof mysqlSchema;
      };

let drizzleInstance: DrizzleDB | null = null;

export function createDrizzleClient(config: IConfigFile, customDbPath?: string): DrizzleDB {
    if (config.dbtype === 'sqlite') {
        const appRootPath = path.join(__dirname, '..', '..');
        const dbPath = customDbPath || path.join(appRootPath, 'data', 'database.db');
        const client = createClient({ url: `file:${dbPath}` });

        const db = drizzleLibSql(client, { schema: sqliteSchema });
        return {
            type: 'sqlite',
            db,
            rawClient: client,
            schema: sqliteSchema,
        };
    } else if (config.dbtype === 'mysql' && config.mysql) {
        const pool = mysql.createPool({
            host: config.mysql.host,
            port: config.mysql.port,
            user: config.mysql.user,
            password: config.mysql.password,
            database: config.mysql.database,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
        });
        const db = drizzleMysql2(pool, { schema: mysqlSchema, mode: 'default' });
        return {
            type: 'mysql',
            db,
            pool,
            schema: mysqlSchema,
        };
    }

    throw new Error(`Unsupported database type: ${config.dbtype}`);
}

export function getDrizzleInstance(config: IConfigFile): DrizzleDB {
    if (!drizzleInstance) {
        drizzleInstance = createDrizzleClient(config);
    }
    return drizzleInstance;
}
