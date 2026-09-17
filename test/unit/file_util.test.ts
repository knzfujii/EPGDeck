import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import FileUtil from '../../src/util/FileUtil.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('FileUtil', () => {
    describe('mkdir', () => {
        const testDir = path.join(__dirname, '../../tmp/test_file_util/sub/deep');

        afterAll(() => {
            const rootTestDir = path.join(__dirname, '../../tmp/test_file_util');
            if (fs.existsSync(rootTestDir)) {
                fs.rmSync(rootTestDir, { recursive: true, force: true });
            }
        });

        it('should recursively create directories', async () => {
            expect(fs.existsSync(testDir)).toBe(false);
            await FileUtil.mkdir(testDir);
            expect(fs.existsSync(testDir)).toBe(true);
        });
    });
});
