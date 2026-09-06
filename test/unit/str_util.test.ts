import { describe, it, expect } from 'vitest';
import StrUtil from '../../src/util/StrUtil';

describe('StrUtil', () => {
    describe('urlJoin', () => {
        it('should join absolute URL with path parts', () => {
            expect(StrUtil.urlJoin('http://localhost:8888', 'api', 'streams')).toBe('http://localhost:8888/api/streams');
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
});
