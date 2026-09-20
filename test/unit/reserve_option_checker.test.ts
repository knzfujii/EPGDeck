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
});
