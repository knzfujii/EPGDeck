import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AUTH_TOKEN_KEY, getAuthToken, setAuthToken, removeAuthToken } from '../../client/src/lib/authStorage.js';

describe('authStorage', () => {
    const mockStorage: Record<string, string> = {};

    beforeEach(() => {
        for (const key of Object.keys(mockStorage)) {
            delete mockStorage[key];
        }

        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key: string) => mockStorage[key] ?? null),
            setItem: vi.fn((key: string, value: string) => {
                mockStorage[key] = value;
            }),
            removeItem: vi.fn((key: string) => {
                delete mockStorage[key];
            }),
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should return null when token is not present', () => {
        expect(getAuthToken()).toBeNull();
    });

    it('should set and get auth token correctly', () => {
        setAuthToken('test-token-123');
        expect(localStorage.setItem).toHaveBeenCalledWith(AUTH_TOKEN_KEY, 'test-token-123');
        expect(getAuthToken()).toBe('test-token-123');
    });

    it('should remove auth token correctly', () => {
        setAuthToken('test-token-123');
        expect(getAuthToken()).toBe('test-token-123');

        removeAuthToken();
        expect(localStorage.removeItem).toHaveBeenCalledWith(AUTH_TOKEN_KEY);
        expect(getAuthToken()).toBeNull();
    });

    it('should safely handle localStorage exceptions', () => {
        vi.stubGlobal('localStorage', {
            getItem: vi.fn(() => {
                throw new Error('Access denied');
            }),
            setItem: vi.fn(() => {
                throw new Error('Quota exceeded');
            }),
            removeItem: vi.fn(() => {
                throw new Error('Access denied');
            }),
        });

        expect(getAuthToken()).toBeNull();
        expect(() => setAuthToken('token')).not.toThrow();
        expect(() => removeAuthToken()).not.toThrow();
    });
});
