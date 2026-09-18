import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Version Consistency', () => {
    it('should match version between root package.json and client package.json', () => {
        const rootPkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8'));
        const clientPkg = JSON.parse(
            fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'package.json'), 'utf-8'),
        );

        expect(rootPkg.version).toBe('0.1.0-beta.1');
        expect(clientPkg.version).toBe(rootPkg.version);
        expect(rootPkg.name).toBe('epgdeck');
        expect(clientPkg.name).toBe('epgdeck-client');
    });
});
