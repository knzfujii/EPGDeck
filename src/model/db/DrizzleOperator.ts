import { inject, injectable } from 'inversify';
import { createDrizzleClient, DrizzleDB } from '../../db/drizzle';
import IConfigFile from '../IConfigFile';
import IConfiguration from '../IConfiguration';
import IDrizzleOperator from './IDrizzleOperator';

@injectable()
export default class DrizzleOperator implements IDrizzleOperator {
    private drizzleDB: DrizzleDB | null = null;
    private config: IConfigFile;

    constructor(@inject('IConfiguration') conf: IConfiguration) {
        this.config = conf.getConfig();
    }

    public getDB(): DrizzleDB {
        if (this.drizzleDB === null) {
            this.drizzleDB = createDrizzleClient(this.config);
        }
        return this.drizzleDB;
    }

    public async checkConnection(): Promise<void> {
        const client = this.getDB();
        if (client.type === 'sqlite') {
            // EPGStation v2.10.0 完全互換の SQLite テーブル定義自動作成
            await client.rawClient.execute(`
                CREATE TABLE IF NOT EXISTS channel (
                    id INTEGER PRIMARY KEY,
                    serviceId INTEGER NOT NULL,
                    networkId INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    halfWidthName TEXT NOT NULL,
                    remoteControlKeyId INTEGER,
                    hasLogoData INTEGER NOT NULL DEFAULT 0,
                    channelTypeId INTEGER NOT NULL,
                    channelType TEXT NOT NULL,
                    channel TEXT NOT NULL,
                    type INTEGER
                );
                CREATE TABLE IF NOT EXISTS drop_log_file (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    errorCnt INTEGER NOT NULL,
                    dropCnt INTEGER NOT NULL,
                    scramblingCnt INTEGER NOT NULL,
                    filePath TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS program (
                    id INTEGER PRIMARY KEY,
                    updateTime INTEGER NOT NULL,
                    channelId INTEGER NOT NULL,
                    eventId INTEGER NOT NULL,
                    serviceId INTEGER NOT NULL,
                    networkId INTEGER NOT NULL,
                    startAt INTEGER NOT NULL,
                    endAt INTEGER NOT NULL,
                    startHour INTEGER NOT NULL,
                    week INTEGER NOT NULL,
                    duration INTEGER NOT NULL,
                    isFree INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    halfWidthName TEXT NOT NULL,
                    shortName TEXT NOT NULL,
                    description TEXT,
                    halfWidthDescription TEXT,
                    extended TEXT,
                    halfWidthExtended TEXT,
                    rawExtended TEXT,
                    rawHalfWidthExtended TEXT,
                    genre1 INTEGER,
                    subGenre1 INTEGER,
                    genre2 INTEGER,
                    subGenre2 INTEGER,
                    genre3 INTEGER,
                    subGenre3 INTEGER,
                    channelType TEXT NOT NULL,
                    channel TEXT NOT NULL,
                    videoType TEXT,
                    videoResolution TEXT,
                    videoStreamContent INTEGER,
                    videoComponentType INTEGER,
                    audioSamplingRate INTEGER,
                    audioComponentType INTEGER
                );
                CREATE TABLE IF NOT EXISTS recorded (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    reserveId INTEGER,
                    ruleId INTEGER,
                    programId INTEGER,
                    channelId INTEGER NOT NULL,
                    isProtected INTEGER NOT NULL DEFAULT 0,
                    startAt INTEGER NOT NULL,
                    endAt INTEGER NOT NULL,
                    duration INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    halfWidthName TEXT NOT NULL,
                    description TEXT,
                    halfWidthDescription TEXT,
                    extended TEXT,
                    halfWidthExtended TEXT,
                    rawExtended TEXT,
                    rawHalfWidthExtended TEXT,
                    genre1 INTEGER,
                    subGenre1 INTEGER,
                    genre2 INTEGER,
                    subGenre2 INTEGER,
                    genre3 INTEGER,
                    subGenre3 INTEGER,
                    videoType TEXT,
                    videoResolution TEXT,
                    videoStreamContent INTEGER,
                    videoComponentType INTEGER,
                    audioSamplingRate INTEGER,
                    audioComponentType INTEGER,
                    isRecording INTEGER NOT NULL,
                    dropLogFileId INTEGER UNIQUE
                );
                CREATE TABLE IF NOT EXISTS recorded_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    channelId INTEGER NOT NULL,
                    endAt INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS recorded_tag (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    halfWidthName TEXT NOT NULL,
                    color TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS recorded_tags_recorded_tag (
                    recordedId INTEGER NOT NULL,
                    recordedTagId INTEGER NOT NULL,
                    PRIMARY KEY (recordedId, recordedTagId)
                );
                CREATE TABLE IF NOT EXISTS reserve (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    updateTime INTEGER NOT NULL,
                    ruleId INTEGER,
                    ruleUpdateCnt INTEGER,
                    isSkip INTEGER NOT NULL DEFAULT 0,
                    isConflict INTEGER NOT NULL DEFAULT 0,
                    allowEndLack INTEGER NOT NULL DEFAULT 0,
                    tags TEXT,
                    isOverlap INTEGER NOT NULL DEFAULT 0,
                    isIgnoreOverlap INTEGER NOT NULL DEFAULT 0,
                    isTimeSpecified INTEGER NOT NULL DEFAULT 0,
                    parentDirectoryName TEXT,
                    directory TEXT,
                    recordedFormat TEXT,
                    encodeMode1 TEXT,
                    encodeParentDirectoryName1 TEXT,
                    encodeDirectory1 TEXT,
                    encodeMode2 TEXT,
                    encodeParentDirectoryName2 TEXT,
                    encodeDirectory2 TEXT,
                    encodeMode3 TEXT,
                    encodeParentDirectoryName3 TEXT,
                    encodeDirectory3 TEXT,
                    isDeleteOriginalAfterEncode INTEGER NOT NULL DEFAULT 0,
                    programId INTEGER,
                    programUpdateTime INTEGER,
                    channelId INTEGER NOT NULL,
                    channel TEXT NOT NULL,
                    channelType TEXT NOT NULL,
                    startAt INTEGER NOT NULL,
                    endAt INTEGER NOT NULL,
                    name TEXT,
                    halfWidthName TEXT,
                    shortName TEXT,
                    description TEXT,
                    halfWidthDescription TEXT,
                    extended TEXT,
                    halfWidthExtended TEXT,
                    rawExtended TEXT,
                    rawHalfWidthExtended TEXT,
                    genre1 INTEGER,
                    subGenre1 INTEGER,
                    genre2 INTEGER,
                    subGenre2 INTEGER,
                    genre3 INTEGER,
                    subGenre3 INTEGER,
                    videoType TEXT,
                    videoResolution TEXT,
                    videoStreamContent INTEGER,
                    videoComponentType INTEGER,
                    audioSamplingRate INTEGER,
                    audioComponentType INTEGER,
                    isEventRelay INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS rule (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    updateCnt INTEGER NOT NULL DEFAULT 0,
                    isTimeSpecification INTEGER NOT NULL DEFAULT 0,
                    keyword TEXT,
                    halfWidthKeyword TEXT,
                    ignoreKeyword TEXT,
                    halfWidthIgnoreKeyword TEXT,
                    keyCS INTEGER NOT NULL DEFAULT 0,
                    keyRegExp INTEGER NOT NULL DEFAULT 0,
                    name INTEGER NOT NULL DEFAULT 0,
                    description INTEGER NOT NULL DEFAULT 0,
                    extended INTEGER NOT NULL DEFAULT 0,
                    ignoreKeyCS INTEGER NOT NULL DEFAULT 0,
                    ignoreKeyRegExp INTEGER NOT NULL DEFAULT 0,
                    ignoreName INTEGER NOT NULL DEFAULT 0,
                    ignoreDescription INTEGER NOT NULL DEFAULT 0,
                    ignoreExtended INTEGER NOT NULL DEFAULT 0,
                    GR INTEGER NOT NULL DEFAULT 0,
                    BS INTEGER NOT NULL DEFAULT 0,
                    CS INTEGER NOT NULL DEFAULT 0,
                    SKY INTEGER NOT NULL DEFAULT 0,
                    channelIds TEXT,
                    genres TEXT,
                    times TEXT,
                    isFree INTEGER NOT NULL DEFAULT 0,
                    durationMin INTEGER,
                    durationMax INTEGER,
                    searchPeriods TEXT,
                    enable INTEGER NOT NULL DEFAULT 1,
                    allowEndLack INTEGER NOT NULL DEFAULT 0,
                    avoidDuplicate INTEGER NOT NULL DEFAULT 0,
                    periodToAvoidDuplicate INTEGER,
                    tags TEXT,
                    parentDirectoryName TEXT,
                    directory TEXT,
                    recordedFormat TEXT,
                    mode1 TEXT,
                    parentDirectoryName1 TEXT,
                    directory1 TEXT,
                    mode2 TEXT,
                    parentDirectoryName2 TEXT,
                    directory2 TEXT,
                    mode3 TEXT,
                    parentDirectoryName3 TEXT,
                    directory3 TEXT,
                    isDeleteOriginalAfterEncode INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS thumbnail (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filePath TEXT NOT NULL,
                    recordedId INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS video_file (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    parentDirectoryName TEXT NOT NULL,
                    filePath TEXT NOT NULL,
                    type TEXT NOT NULL,
                    name TEXT NOT NULL,
                    size INTEGER NOT NULL DEFAULT 0,
                    recordedId INTEGER NOT NULL
                );
            `);
        } else {
            // EPGStation v2.10.0 完全互換の MySQL テーブル定義自動作成（キー名は自動命名）
            const queries = [
                `CREATE TABLE IF NOT EXISTS \`channel\` (
                    \`id\` bigint(20) NOT NULL,
                    \`serviceId\` int(11) NOT NULL,
                    \`networkId\` int(11) NOT NULL,
                    \`name\` text NOT NULL,
                    \`halfWidthName\` text NOT NULL,
                    \`remoteControlKeyId\` int(11) DEFAULT NULL,
                    \`hasLogoData\` tinyint(4) NOT NULL DEFAULT 0,
                    \`channelTypeId\` int(11) NOT NULL,
                    \`channelType\` varchar(255) NOT NULL,
                    \`channel\` varchar(255) NOT NULL,
                    \`type\` int(11) DEFAULT NULL,
                    PRIMARY KEY (\`id\`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
                `CREATE TABLE IF NOT EXISTS \`drop_log_file\` (
                    \`id\` int(11) NOT NULL AUTO_INCREMENT,
                    \`errorCnt\` bigint(20) NOT NULL,
                    \`dropCnt\` bigint(20) NOT NULL,
                    \`scramblingCnt\` bigint(20) NOT NULL,
                    \`filePath\` text NOT NULL,
                    PRIMARY KEY (\`id\`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
                `CREATE TABLE IF NOT EXISTS \`program\` (
                    \`id\` bigint(20) NOT NULL,
                    \`updateTime\` bigint(20) NOT NULL,
                    \`channelId\` bigint(20) NOT NULL,
                    \`eventId\` bigint(20) NOT NULL,
                    \`serviceId\` int(11) NOT NULL,
                    \`networkId\` int(11) NOT NULL,
                    \`startAt\` bigint(20) NOT NULL,
                    \`endAt\` bigint(20) NOT NULL,
                    \`startHour\` int(11) NOT NULL,
                    \`week\` int(11) NOT NULL,
                    \`duration\` int(11) NOT NULL,
                    \`isFree\` tinyint(4) NOT NULL,
                    \`name\` text NOT NULL,
                    \`halfWidthName\` text NOT NULL,
                    \`shortName\` text NOT NULL,
                    \`description\` text DEFAULT NULL,
                    \`halfWidthDescription\` text DEFAULT NULL,
                    \`extended\` text DEFAULT NULL,
                    \`halfWidthExtended\` text DEFAULT NULL,
                    \`genre1\` int(11) DEFAULT NULL,
                    \`subGenre1\` int(11) DEFAULT NULL,
                    \`genre2\` int(11) DEFAULT NULL,
                    \`subGenre2\` int(11) DEFAULT NULL,
                    \`genre3\` int(11) DEFAULT NULL,
                    \`subGenre3\` int(11) DEFAULT NULL,
                    \`channelType\` varchar(255) NOT NULL,
                    \`channel\` varchar(255) NOT NULL,
                    \`videoType\` text DEFAULT NULL,
                    \`videoResolution\` text DEFAULT NULL,
                    \`videoStreamContent\` int(11) DEFAULT NULL,
                    \`videoComponentType\` int(11) DEFAULT NULL,
                    \`audioSamplingRate\` int(11) DEFAULT NULL,
                    \`audioComponentType\` int(11) DEFAULT NULL,
                    \`rawExtended\` text DEFAULT NULL,
                    \`rawHalfWidthExtended\` text DEFAULT NULL,
                    PRIMARY KEY (\`id\`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
                `CREATE TABLE IF NOT EXISTS \`recorded\` (
                    \`id\` int(11) NOT NULL AUTO_INCREMENT,
                    \`reserveId\` int(11) DEFAULT NULL,
                    \`ruleId\` int(11) DEFAULT NULL,
                    \`programId\` bigint(20) DEFAULT NULL,
                    \`channelId\` bigint(20) NOT NULL,
                    \`isProtected\` tinyint(4) NOT NULL DEFAULT 0,
                    \`startAt\` bigint(20) NOT NULL,
                    \`endAt\` bigint(20) NOT NULL,
                    \`duration\` int(11) NOT NULL,
                    \`name\` text NOT NULL,
                    \`halfWidthName\` text NOT NULL,
                    \`description\` text DEFAULT NULL,
                    \`halfWidthDescription\` text DEFAULT NULL,
                    \`extended\` text DEFAULT NULL,
                    \`halfWidthExtended\` text DEFAULT NULL,
                    \`genre1\` int(11) DEFAULT NULL,
                    \`subGenre1\` int(11) DEFAULT NULL,
                    \`genre2\` int(11) DEFAULT NULL,
                    \`subGenre2\` int(11) DEFAULT NULL,
                    \`genre3\` int(11) DEFAULT NULL,
                    \`subGenre3\` int(11) DEFAULT NULL,
                    \`videoType\` text DEFAULT NULL,
                    \`videoResolution\` text DEFAULT NULL,
                    \`videoStreamContent\` int(11) DEFAULT NULL,
                    \`videoComponentType\` int(11) DEFAULT NULL,
                    \`audioSamplingRate\` int(11) DEFAULT NULL,
                    \`audioComponentType\` int(11) DEFAULT NULL,
                    \`isRecording\` tinyint(4) NOT NULL,
                    \`dropLogFileId\` int(11) DEFAULT NULL,
                    \`rawExtended\` text DEFAULT NULL,
                    \`rawHalfWidthExtended\` text DEFAULT NULL,
                    PRIMARY KEY (\`id\`),
                    UNIQUE KEY (\`dropLogFileId\`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
                `CREATE TABLE IF NOT EXISTS \`recorded_history\` (
                    \`id\` int(11) NOT NULL AUTO_INCREMENT,
                    \`name\` text NOT NULL,
                    \`channelId\` bigint(20) NOT NULL,
                    \`endAt\` bigint(20) NOT NULL,
                    PRIMARY KEY (\`id\`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
                `CREATE TABLE IF NOT EXISTS \`recorded_tag\` (
                    \`id\` int(11) NOT NULL AUTO_INCREMENT,
                    \`name\` text NOT NULL,
                    \`halfWidthName\` text NOT NULL,
                    \`color\` varchar(255) NOT NULL,
                    PRIMARY KEY (\`id\`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
                `CREATE TABLE IF NOT EXISTS \`recorded_tags_recorded_tag\` (
                    \`recordedId\` int(11) NOT NULL,
                    \`recordedTagId\` int(11) NOT NULL,
                    PRIMARY KEY (\`recordedId\`,\`recordedTagId\`),
                    KEY (\`recordedId\`),
                    KEY (\`recordedTagId\`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
                `CREATE TABLE IF NOT EXISTS \`reserve\` (
                    \`id\` int(11) NOT NULL AUTO_INCREMENT,
                    \`updateTime\` bigint(20) NOT NULL,
                    \`ruleId\` int(11) DEFAULT NULL,
                    \`ruleUpdateCnt\` int(11) DEFAULT NULL,
                    \`isSkip\` tinyint(4) NOT NULL DEFAULT 0,
                    \`isConflict\` tinyint(4) NOT NULL DEFAULT 0,
                    \`allowEndLack\` tinyint(4) NOT NULL DEFAULT 0,
                    \`tags\` text DEFAULT NULL,
                    \`isOverlap\` tinyint(4) NOT NULL DEFAULT 0,
                    \`isIgnoreOverlap\` tinyint(4) NOT NULL DEFAULT 0,
                    \`isTimeSpecified\` tinyint(4) NOT NULL DEFAULT 0,
                    \`parentDirectoryName\` text DEFAULT NULL,
                    \`directory\` text DEFAULT NULL,
                    \`recordedFormat\` text DEFAULT NULL,
                    \`encodeMode1\` text DEFAULT NULL,
                    \`encodeParentDirectoryName1\` text DEFAULT NULL,
                    \`encodeDirectory1\` text DEFAULT NULL,
                    \`encodeMode2\` text DEFAULT NULL,
                    \`encodeParentDirectoryName2\` text DEFAULT NULL,
                    \`encodeDirectory2\` text DEFAULT NULL,
                    \`encodeMode3\` text DEFAULT NULL,
                    \`encodeParentDirectoryName3\` text DEFAULT NULL,
                    \`encodeDirectory3\` text DEFAULT NULL,
                    \`isDeleteOriginalAfterEncode\` tinyint(4) NOT NULL DEFAULT 0,
                    \`programId\` bigint(20) DEFAULT NULL,
                    \`programUpdateTime\` bigint(20) DEFAULT NULL,
                    \`channelId\` bigint(20) NOT NULL,
                    \`channel\` text NOT NULL,
                    \`channelType\` text NOT NULL,
                    \`startAt\` bigint(20) NOT NULL,
                    \`endAt\` bigint(20) NOT NULL,
                    \`name\` text DEFAULT NULL,
                    \`halfWidthName\` text DEFAULT NULL,
                    \`shortName\` text DEFAULT NULL,
                    \`description\` text DEFAULT NULL,
                    \`halfWidthDescription\` text DEFAULT NULL,
                    \`extended\` text DEFAULT NULL,
                    \`halfWidthExtended\` text DEFAULT NULL,
                    \`genre1\` int(11) DEFAULT NULL,
                    \`subGenre1\` int(11) DEFAULT NULL,
                    \`genre2\` int(11) DEFAULT NULL,
                    \`subGenre2\` int(11) DEFAULT NULL,
                    \`genre3\` int(11) DEFAULT NULL,
                    \`subGenre3\` int(11) DEFAULT NULL,
                    \`videoType\` text DEFAULT NULL,
                    \`videoResolution\` text DEFAULT NULL,
                    \`videoStreamContent\` int(11) DEFAULT NULL,
                    \`videoComponentType\` int(11) DEFAULT NULL,
                    \`audioSamplingRate\` int(11) DEFAULT NULL,
                    \`audioComponentType\` int(11) DEFAULT NULL,
                    \`rawExtended\` text DEFAULT NULL,
                    \`rawHalfWidthExtended\` text DEFAULT NULL,
                    \`isEventRelay\` tinyint(4) NOT NULL DEFAULT 0,
                    PRIMARY KEY (\`id\`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
                `CREATE TABLE IF NOT EXISTS \`rule\` (
                    \`id\` int(11) NOT NULL AUTO_INCREMENT,
                    \`updateCnt\` int(11) NOT NULL DEFAULT 0,
                    \`isTimeSpecification\` tinyint(4) NOT NULL DEFAULT 0,
                    \`keyword\` text DEFAULT NULL,
                    \`halfWidthKeyword\` text DEFAULT NULL,
                    \`ignoreKeyword\` text DEFAULT NULL,
                    \`halfWidthIgnoreKeyword\` text DEFAULT NULL,
                    \`keyCS\` tinyint(4) NOT NULL DEFAULT 0,
                    \`keyRegExp\` tinyint(4) NOT NULL DEFAULT 0,
                    \`name\` tinyint(4) NOT NULL DEFAULT 0,
                    \`description\` tinyint(4) NOT NULL DEFAULT 0,
                    \`extended\` tinyint(4) NOT NULL DEFAULT 0,
                    \`ignoreKeyCS\` tinyint(4) NOT NULL DEFAULT 0,
                    \`ignoreKeyRegExp\` tinyint(4) NOT NULL DEFAULT 0,
                    \`ignoreName\` tinyint(4) NOT NULL DEFAULT 0,
                    \`ignoreDescription\` tinyint(4) NOT NULL DEFAULT 0,
                    \`ignoreExtended\` tinyint(4) NOT NULL DEFAULT 0,
                    \`GR\` tinyint(4) NOT NULL DEFAULT 0,
                    \`BS\` tinyint(4) NOT NULL DEFAULT 0,
                    \`CS\` tinyint(4) NOT NULL DEFAULT 0,
                    \`SKY\` tinyint(4) NOT NULL DEFAULT 0,
                    \`channelIds\` text DEFAULT NULL,
                    \`genres\` text DEFAULT NULL,
                    \`times\` text DEFAULT NULL,
                    \`isFree\` tinyint(4) NOT NULL DEFAULT 0,
                    \`durationMin\` int(11) DEFAULT NULL,
                    \`durationMax\` int(11) DEFAULT NULL,
                    \`searchPeriods\` text DEFAULT NULL,
                    \`enable\` tinyint(4) NOT NULL DEFAULT 0,
                    \`avoidDuplicate\` tinyint(4) NOT NULL DEFAULT 0,
                    \`periodToAvoidDuplicate\` int(11) DEFAULT NULL,
                    \`allowEndLack\` tinyint(4) NOT NULL DEFAULT 1,
                    \`tags\` text DEFAULT NULL,
                    \`parentDirectoryName\` text DEFAULT NULL,
                    \`directory\` text DEFAULT NULL,
                    \`recordedFormat\` text DEFAULT NULL,
                    \`mode1\` text DEFAULT NULL,
                    \`parentDirectoryName1\` text DEFAULT NULL,
                    \`directory1\` text DEFAULT NULL,
                    \`mode2\` text DEFAULT NULL,
                    \`parentDirectoryName2\` text DEFAULT NULL,
                    \`directory2\` text DEFAULT NULL,
                    \`mode3\` text DEFAULT NULL,
                    \`parentDirectoryName3\` text DEFAULT NULL,
                    \`directory3\` text DEFAULT NULL,
                    \`isDeleteOriginalAfterEncode\` tinyint(4) NOT NULL DEFAULT 0,
                    PRIMARY KEY (\`id\`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
                `CREATE TABLE IF NOT EXISTS \`thumbnail\` (
                    \`id\` int(11) NOT NULL AUTO_INCREMENT,
                    \`filePath\` text NOT NULL,
                    \`recordedId\` int(11) NOT NULL,
                    PRIMARY KEY (\`id\`),
                    KEY (\`recordedId\`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
                `CREATE TABLE IF NOT EXISTS \`video_file\` (
                    \`id\` int(11) NOT NULL AUTO_INCREMENT,
                    \`parentDirectoryName\` text NOT NULL,
                    \`filePath\` text NOT NULL,
                    \`type\` text NOT NULL,
                    \`name\` text NOT NULL,
                    \`size\` bigint(20) NOT NULL DEFAULT 0,
                    \`recordedId\` int(11) NOT NULL,
                    PRIMARY KEY (\`id\`),
                    KEY (\`recordedId\`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            ];

            for (const q of queries) {
                await client.pool.query(q);
            }
        }
    }

    public async closeConnection(): Promise<void> {
        if (this.drizzleDB !== null) {
            if (this.drizzleDB.type === 'sqlite') {
                this.drizzleDB.rawClient.close();
            } else {
                await this.drizzleDB.pool.end();
            }
            this.drizzleDB = null;
        }
    }
}
