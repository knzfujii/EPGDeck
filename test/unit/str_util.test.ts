import { describe, it, expect } from 'vitest';
import StrUtil from '../../src/util/StrUtil.js';

describe('StrUtil', () => {
    describe('urlJoin', () => {
        it('should join absolute URL with path parts', () => {
            expect(StrUtil.urlJoin('http://localhost:8888', 'api', 'streams')).toBe(
                'http://localhost:8888/api/streams',
            );
        });

        it('should deduplicate redundant slashes', () => {
            expect(StrUtil.urlJoin('http://localhost:8888/', '/api/', '/test/')).toBe('http://localhost:8888/api/test');
        });

        it('should handle root-relative paths', () => {
            expect(StrUtil.urlJoin('/', 'subDirectory')).toBe('/subDirectory');
            expect(StrUtil.urlJoin('/subDirectory/', '/socket.io')).toBe('/subDirectory/socket.io');
        });

        it('should handle empty or single arguments', () => {
            expect(StrUtil.urlJoin('http://example.com')).toBe('http://example.com');
            expect(StrUtil.urlJoin('')).toBe('');
        });
    });

    describe('getHalfOrFull', () => {
        it('should return halfWidth when isHalfWidth=true and half exists', () => {
            expect(StrUtil.getHalfOrFull('テスト１２３', 'テスト123', true)).toBe('テスト123');
        });

        it('should fallback to toHalf(full) when isHalfWidth=true and half is null/undefined', () => {
            expect(StrUtil.getHalfOrFull('テスト１２３', null, true)).toBe('テスト123');
            expect(StrUtil.getHalfOrFull('テスト１２３', undefined, true)).toBe('テスト123');
        });

        it('should return full when isHalfWidth=false and full exists', () => {
            expect(StrUtil.getHalfOrFull('テスト１２３', 'テスト123', false)).toBe('テスト１２３');
        });

        it('should fallback to toDouble(half) when isHalfWidth=false and full is null/undefined', () => {
            expect(StrUtil.getHalfOrFull(null, 'テスト123', false)).toBe('テスト１２３');
            expect(StrUtil.getHalfOrFull(undefined, 'テスト123', false)).toBe('テスト１２３');
        });

        it('should return empty string when both are null/undefined', () => {
            expect(StrUtil.getHalfOrFull(null, null, true)).toBe('');
            expect(StrUtil.getHalfOrFull(undefined, undefined, false)).toBe('');
        });
    });

    describe('getHalfOrFullNullable', () => {
        it('should return null when both are null/undefined', () => {
            expect(StrUtil.getHalfOrFullNullable(null, null, true)).toBeNull();
            expect(StrUtil.getHalfOrFullNullable(undefined, undefined, false)).toBeNull();
        });

        it('should fallback to toHalf(full) when half is null and isHalfWidth=true', () => {
            expect(StrUtil.getHalfOrFullNullable('詳細１２３', null, true)).toBe('詳細123');
        });

        it('should fallback to toDouble(half) when full is null and isHalfWidth=false', () => {
            expect(StrUtil.getHalfOrFullNullable(null, '詳細123', false)).toBe('詳細１２３');
        });
    });
});
