import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import ReserveOptionChecker from '../../src/model/operator/ReserveOptionChecker.js';

describe('ReserveOptionChecker', () => {
    const dummyConfig: any = {
        getConfig: () => ({ encode: { presets: [] } }),
    };
    const checker = new ReserveOptionChecker(dummyConfig);

    it('should allow rules without keywords when only genre is specified', () => {
        const result = checker.checkRuleOption({
            isTimeSpecification: false,
            searchOption: {
                GR: true,
                BS: false,
                CS: false,
                SKY: false,
                isFree: false,
                genres: [{ genre: 7 }],
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);

        expect(result).toBe(true);
    });

    it('should allow rules without keywords even if name or description boolean flags are true', () => {
        const result = checker.checkRuleOption({
            isTimeSpecification: false,
            searchOption: {
                name: true,
                description: true,
                GR: true,
                BS: false,
                CS: false,
                SKY: false,
                isFree: false,
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);

        expect(result).toBe(true);
    });

    it('should treat empty or whitespace-only keyword as keyword-less and pass', () => {
        const result = checker.checkRuleOption({
            isTimeSpecification: false,
            searchOption: {
                keyword: '   ',
                name: true,
                description: true,
                GR: true,
                BS: false,
                CS: false,
                SKY: false,
                isFree: false,
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);

        expect(result).toBe(true);
    });

    it('should validate regex when keyword is specified', () => {
        const validResult = checker.checkRuleOption({
            isTimeSpecification: false,
            searchOption: {
                keyword: '.*[0-9]+',
                keyRegExp: true,
                name: true,
                description: false,
                extended: false,
                GR: true,
                BS: false,
                CS: false,
                SKY: false,
                isFree: false,
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);
        expect(validResult).toBe(true);

        const invalidResult = checker.checkRuleOption({
            isTimeSpecification: false,
            searchOption: {
                keyword: '(?+[invalid',
                keyRegExp: true,
                name: true,
                description: false,
                extended: false,
                GR: true,
                BS: false,
                CS: false,
                SKY: false,
                isFree: false,
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);
        expect(invalidResult).toBe(false);
    });

    it('should reject keyword search if all name, description, and extended are false', () => {
        const result = checker.checkRuleOption({
            isTimeSpecification: false,
            searchOption: {
                keyword: 'フリーレン',
                name: false,
                description: false,
                extended: false,
                GR: true,
                BS: false,
                CS: false,
                SKY: false,
                isFree: false,
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);

        expect(result).toBe(false);
    });

    it('should allow time.range up to 48 hours', () => {
        // 24 hours
        const r24 = checker.checkRuleOption({
            isTimeSpecification: false,
            searchOption: {
                GR: true,
                BS: false,
                CS: false,
                SKY: false,
                isFree: false,
                times: [{ week: 127, start: 0, range: 24 }],
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);
        expect(r24).toBe(true);

        // 48 hours
        const r48 = checker.checkRuleOption({
            isTimeSpecification: false,
            searchOption: {
                GR: true,
                BS: false,
                CS: false,
                SKY: false,
                isFree: false,
                times: [{ week: 127, start: 0, range: 48 }],
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);
        expect(r48).toBe(true);

        // 49 hours (should fail)
        const r49 = checker.checkRuleOption({
            isTimeSpecification: false,
            searchOption: {
                GR: true,
                BS: false,
                CS: false,
                SKY: false,
                isFree: false,
                times: [{ week: 127, start: 0, range: 49 }],
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);
        expect(r49).toBe(false);
    });

    it('should validate channelIds vs broadcast flags', () => {
        // channelIds with GR=false -> ok
        const valid = checker.checkRuleOption({
            isTimeSpecification: false,
            searchOption: {
                channelIds: [1],
                GR: false,
                BS: false,
                CS: false,
                SKY: false,
                isFree: false,
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);
        expect(valid).toBe(true);

        // channelIds with GR=true -> conflict -> false
        const invalid = checker.checkRuleOption({
            isTimeSpecification: false,
            searchOption: {
                channelIds: [1],
                GR: true,
                BS: false,
                CS: false,
                SKY: false,
                isFree: false,
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);
        expect(invalid).toBe(false);
    });

    it('should reject times with week: 0', () => {
        const result = checker.checkRuleOption({
            isTimeSpecification: false,
            searchOption: {
                GR: true,
                BS: false,
                CS: false,
                SKY: false,
                isFree: false,
                times: [{ week: 0, start: 0, range: 1 }],
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);
        expect(result).toBe(false);
    });

    it('should validate durationMin and durationMax', () => {
        const valid = checker.checkRuleOption({
            isTimeSpecification: false,
            searchOption: {
                GR: true,
                BS: false,
                CS: false,
                SKY: false,
                isFree: false,
                durationMin: 30,
                durationMax: 60,
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);
        expect(valid).toBe(true);

        const invalid = checker.checkRuleOption({
            isTimeSpecification: false,
            searchOption: {
                GR: true,
                BS: false,
                CS: false,
                SKY: false,
                isFree: false,
                durationMin: 60,
                durationMax: 30,
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);
        expect(invalid).toBe(false);
    });

    it('should validate time-specified reservation rules (isTimeSpecification === true)', () => {
        // 正常系: 秒単位（19:30〜20:45 = start: 70200, range: 4500）
        const validSeconds = checker.checkRuleOption({
            isTimeSpecification: true,
            searchOption: {
                keyword: 'ニュース枠',
                channelIds: [1],
                times: [{ week: 0x02, start: 70200, range: 4500 }],
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);
        expect(validSeconds).toBe(true);

        // 正常系: 2分予約枠（120秒）
        const valid2min = checker.checkRuleOption({
            isTimeSpecification: true,
            searchOption: {
                keyword: '2分ミニ番組枠',
                channelIds: [1],
                times: [{ week: 0x7f, start: 70200, range: 120 }],
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);
        expect(valid2min).toBe(true);

        // 正常系: 最大24時間枠 (86400秒)
        const valid24h = checker.checkRuleOption({
            isTimeSpecification: true,
            searchOption: {
                keyword: '24時間生放送枠',
                channelIds: [1],
                times: [{ week: 0x7f, start: 0, range: 86400 }],
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);
        expect(valid24h).toBe(true);

        // 異常系: range > 86400（時間指定予約は24時間以内）
        const invalidOver24h = checker.checkRuleOption({
            isTimeSpecification: true,
            searchOption: {
                keyword: '超過枠',
                channelIds: [1],
                times: [{ week: 0x7f, start: 0, range: 86401 }],
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);
        expect(invalidOver24h).toBe(false);

        // 異常系: week === 0
        const invalidWeek0 = checker.checkRuleOption({
            isTimeSpecification: true,
            searchOption: {
                keyword: '曜日未選択',
                channelIds: [1],
                times: [{ week: 0, start: 10, range: 1 }],
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);
        expect(invalidWeek0).toBe(false);

        // 異常系: channelIds が空
        const invalidNoChannel = checker.checkRuleOption({
            isTimeSpecification: true,
            searchOption: {
                keyword: '局未選択',
                channelIds: [],
                times: [{ week: 0x01, start: 10, range: 1 }],
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);
        expect(invalidNoChannel).toBe(false);

        // 異常系: keyword が未指定
        const invalidNoKeyword = checker.checkRuleOption({
            isTimeSpecification: true,
            searchOption: {
                channelIds: [1],
                times: [{ week: 0x01, start: 10, range: 1 }],
            },
            reserveOption: {
                enable: true,
                allowEndLack: true,
                avoidDuplicate: false,
            },
        } as any);
        expect(invalidNoKeyword).toBe(false);
    });
});
