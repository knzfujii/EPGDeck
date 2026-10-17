import { Hono } from 'hono';
import * as fs from 'node:fs';
import * as path from 'node:path';

const __dirname = import.meta.dirname;

const app = new Hono().get('/', async c => {
    const pkg = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'package.json'), 'utf-8'),
    );
    return c.json({ version: pkg.version });
});

export default app;
