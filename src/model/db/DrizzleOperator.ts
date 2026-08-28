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
            // テーブル作成
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
                    scramblingCnt INTEGER NOT NULL
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
                    halfWidthName TEXT NOT NULL,
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
                    isSkip INTEGER NOT NULL DEFAULT 0,
                    isConflict INTEGER NOT NULL DEFAULT 0,
                    allowEndLack INTEGER NOT NULL DEFAULT 0,
                    isOverlap INTEGER NOT NULL DEFAULT 0,
                    isIgnoreOverlap INTEGER NOT NULL DEFAULT 0,
                    isTimeSpecified INTEGER NOT NULL DEFAULT 0,
                    isEventRelay INTEGER NOT NULL DEFAULT 0,
                    isDeleteOriginalAfterEncode INTEGER NOT NULL DEFAULT 0,
                    ruleId INTEGER,
                    programId INTEGER,
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
                    channelId INTEGER NOT NULL,
                    startAt INTEGER NOT NULL,
                    endAt INTEGER NOT NULL,
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
                    audioComponentType INTEGER
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
                    recordedId INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS video_file (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    type TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    recordedId INTEGER NOT NULL,
                    parentDirectoryName TEXT NOT NULL,
                    subDirectory TEXT
                );
            `);
        } else {
            await client.pool.query('SELECT 1');
        }
    }
}
