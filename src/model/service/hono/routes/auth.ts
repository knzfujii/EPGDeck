import { Hono } from 'hono';
import IConfiguration from '../../../IConfiguration';
import container from '../../../ModelContainer';
import { AuthManager } from '../AuthManager';
import * as api from '../HonoApiUtil';

const app = new Hono();

// POST /api/auth/unlock
app.post('/unlock', async c => {
    const configuration = container.get<IConfiguration>('IConfiguration');
    const config = configuration.getConfig();
    const readOnly = config.readOnly;

    if (!readOnly || !readOnly.enabled) {
        // リードオンリーが無効な場合はすでにアンロック状態
        return api.responseJSON(c, 200, {
            unlocked: true,
            isReadOnlyEnabled: false,
        });
    }

    const expectedPassword = readOnly.password;
    if (!expectedPassword) {
        return api.responseError(c, {
            code: 400,
            message: 'passwordNotConfigured',
        });
    }

    try {
        const body = await c.req.json();
        const inputPassword = typeof body.password === 'string' ? body.password : '';

        if (inputPassword !== expectedPassword) {
            return api.responseError(c, {
                code: 401,
                message: 'incorrectPassword',
            });
        }

        const token = AuthManager.generateToken(expectedPassword);
        return api.responseJSON(c, 200, {
            unlocked: true,
            token,
        });
    } catch {
        return api.responseError(c, {
            code: 400,
            message: 'invalidRequest',
        });
    }
});

// GET /api/auth/status
app.get('/status', async c => {
    const configuration = container.get<IConfiguration>('IConfiguration');
    const config = configuration.getConfig();
    const readOnly = config.readOnly;

    if (!readOnly || !readOnly.enabled) {
        return api.responseJSON(c, 200, {
            isReadOnlyEnabled: false,
            isUnlocked: true,
            allowedOperations: ['liveStream', 'recordedStream', 'download'],
        });
    }

    const authHeader = c.req.header('authorization');
    let isUnlocked = false;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        isUnlocked = AuthManager.verifyToken(token, readOnly.password);
    }

    return api.responseJSON(c, 200, {
        isReadOnlyEnabled: true,
        isUnlocked,
        allowedOperations: readOnly.allowedOperations || [],
    });
});

// POST /api/auth/lock
app.post('/lock', async c => {
    return api.responseJSON(c, 200, {
        result: 'locked',
    });
});

export default app;
