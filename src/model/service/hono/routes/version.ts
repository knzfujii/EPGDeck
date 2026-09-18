import { Hono } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = new Hono().get('/', async c => {
    const pkg = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'package.json'), 'utf-8'),
    );
    return c.json({ version: pkg.version });
});

export default app;
