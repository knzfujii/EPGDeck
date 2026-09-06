import { describe, it, expect } from 'vitest';
import { parseArgs } from 'util';

describe('DBTools CLI argument parsing (util.parseArgs)', () => {
    const parseDBToolsArgs = (args: string[]) => {
        const { values } = parseArgs({
            args,
            options: {
                mode: {
                    type: 'string',
                    short: 'm',
                },
                output: {
                    type: 'string',
                    short: 'o',
                },
            },
            strict: false,
        });
        return values;
    };

    it('should parse short options -m and -o', () => {
        const result = parseDBToolsArgs(['-m', 'backup', '-o', '/path/to/backup.json']);
        expect(result.mode).toBe('backup');
        expect(result.output).toBe('/path/to/backup.json');
    });

    it('should parse long options --mode and --output', () => {
        const result = parseDBToolsArgs(['--mode', 'restore', '--output', '/path/to/restore.json']);
        expect(result.mode).toBe('restore');
        expect(result.output).toBe('/path/to/restore.json');
    });

    it('should handle missing options gracefully', () => {
        const result = parseDBToolsArgs(['-m', 'backup']);
        expect(result.mode).toBe('backup');
        expect(result.output).toBeUndefined();
    });
});
