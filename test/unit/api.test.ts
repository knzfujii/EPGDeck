import { describe, expect, it } from 'vitest';
import { isSecureProtocol } from '../../src/model/service/api';

describe('API Utils', () => {
    describe('isSecureProtocol', () => {
        it('should detect https from x-forwarded-proto header', () => {
            const req = {
                header: (name: string) => (name.toLowerCase() === 'x-forwarded-proto' ? 'https' : undefined),
                protocol: 'http',
            } as any;
            expect(isSecureProtocol(req)).toBe(true);
        });

        it('should detect https from req.protocol', () => {
            const req = {
                header: (_name: string) => undefined,
                protocol: 'https',
            } as any;
            expect(isSecureProtocol(req)).toBe(true);
        });

        it('should return false for plain http', () => {
            const req = {
                header: (_name: string) => undefined,
                protocol: 'http',
            } as any;
            expect(isSecureProtocol(req)).toBe(false);
        });
    });
});
