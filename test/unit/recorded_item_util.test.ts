import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import RecordedItemUtil from '../../src/model/api/RecordedItemUtil.js';
import Recorded from '../../src/db/entities/Recorded.js';

describe('RecordedItemUtil', () => {
    const util = new RecordedItemUtil();

    it('convertRecordedToRecordedItem should include duration from recorded entity', () => {
        const recorded = new Recorded();
        recorded.id = 1;
        recorded.channelId = 101;
        recorded.startAt = 1000000;
        recorded.endAt = 2800000;
        recorded.duration = 1800000; // 30 minutes in ms
        recorded.name = 'テスト番組';
        recorded.halfWidthName = 'ﾃｽﾄ番組';
        recorded.isRecording = false;
        recorded.isProtected = false;

        const item = util.convertRecordedToRecordedItem(recorded, false);
        expect(item.id).toBe(1);
        expect(item.startAt).toBe(1000000);
        expect(item.endAt).toBe(2800000);
        expect(item.duration).toBe(1800000);
    });
});
