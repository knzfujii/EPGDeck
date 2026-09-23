import { describe, it, expect, vi } from 'vitest';
import Util from '../../src/util/Util.js';

describe('Util Unit Tests', () => {
    describe('sleep', () => {
        it('resolves after specified milliseconds', async () => {
            vi.useFakeTimers();
            const promise = Util.sleep(1000);

            let resolved = false;
            void promise.then(() => {
                resolved = true;
            });

            expect(resolved).toBe(false);

            vi.advanceTimersByTime(500);
            expect(resolved).toBe(false);

            vi.advanceTimersByTime(500);
            await promise;
            expect(resolved).toBe(true);

            vi.useRealTimers();
        });
    });
});
