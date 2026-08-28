import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

describe('Config Template', () => {
    it('should successfully parse config.yml.template', () => {
        const templatePath = path.join(__dirname, '..', '..', 'config', 'config.yml.template');
        const content = fs.readFileSync(templatePath, 'utf-8');
        const parsed = yaml.load(content) as any;

        expect(parsed).toBeDefined();
        expect(parsed.port).toBe(8888);
        expect(parsed.dbtype).toBe('sqlite');
        expect(parsed.mirakurunPath).toBeDefined();
        expect(parsed.recorded).toBeInstanceOf(Array);
        expect(parsed.recorded.length).toBeGreaterThan(0);
    });

    it('should successfully parse log config templates', () => {
        const logTemplates = [
            'operatorLogConfig.sample.yml',
            'epgUpdaterLogConfig.sample.yml',
            'serviceLogConfig.sample.yml',
        ];

        for (const filename of logTemplates) {
            const filePath = path.join(__dirname, '..', '..', 'config', filename);
            const content = fs.readFileSync(filePath, 'utf-8');
            const parsed = yaml.load(content) as any;

            expect(parsed).toBeDefined();
            expect(parsed.appenders).toBeDefined();
            expect(parsed.categories).toBeDefined();
        }
    });
});
