import { Hono } from 'hono';
import * as fs from 'fs';
import * as path from 'path';
import * as api from '../HonoApiUtil';

const app = new Hono();

app.get('/', async c => {
    try {
        const pkg = JSON.parse(
            fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'package.json'), 'utf-8'),
        );
        return api.responseJSON(c, 200, { version: pkg.version });
    } catch (err: any) {
        return api.responseServerError(c, err.message);
    }
});

export default app;
