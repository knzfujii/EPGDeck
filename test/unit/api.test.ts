import { describe, expect, it } from 'vitest';
import { isSecureProtocol } from '../../src/model/service/hono/HonoApiUtil';

describe('Hono API Utils', () => {
    describe('isSecureProtocol', () => {
        it('should detect https from x-forwarded-proto header', () => {
            const c = {
                req: {
                    header: (name: string) => (name.toLowerCase() === 'x-forwarded-proto' ? 'https' : undefined),
                    url: 'http://localhost:8888/api/test',
                },
            } as any;
            expect(isSecureProtocol(c)).toBe(true);
        });

        it('should detect https from request url protocol', () => {
            const c = {
                req: {
                    header: (_name: string) => undefined,
                    url: 'https://example.com/api/test',
                },
            } as any;
            expect(isSecureProtocol(c)).toBe(true);
        });

        it('should return false for plain http', () => {
            const c = {
                req: {
                    header: (_name: string) => undefined,
                    url: 'http://localhost:8888/api/test',
                },
            } as any;
            expect(isSecureProtocol(c)).toBe(false);
        });
    });
});
