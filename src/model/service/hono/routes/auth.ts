import { Hono } from 'hono';
import IConfiguration from '../../../IConfiguration.js';
import container from '../../../ModelContainer.js';
import { AuthManager } from '../AuthManager.js';
import { ApiError, BadRequestError } from '../../../error/ApiError.js';

const app = new Hono()
    // POST /api/auth/unlock
    .post('/unlock', async c => {
        const configuration = container.get<IConfiguration>('IConfiguration');
        const config = configuration.getConfig();
        const readOnly = config.readOnly;

        if (!readOnly || !readOnly.enabled) {
            return c.json({
                unlocked: true,
                isReadOnlyEnabled: false,
            });
        }

        const expectedPassword = readOnly.password;
        if (!expectedPassword) {
            throw new BadRequestError('passwordNotConfigured');
        }

        const body = await c.req.json().catch(() => {
            throw new BadRequestError('invalidRequest');
        });
        const inputPassword = typeof body?.password === 'string' ? body.password : '';

        if (inputPassword !== expectedPassword) {
            throw new ApiError(401, 'incorrectPassword');
        }

        const token = AuthManager.generateToken(expectedPassword);
        return c.json({
            unlocked: true,
            token,
        });
    })
    // GET /api/auth/status
    .get('/status', async c => {
        const configuration = container.get<IConfiguration>('IConfiguration');
        const config = configuration.getConfig();
        const readOnly = config.readOnly;

        if (!readOnly || !readOnly.enabled) {
            return c.json({
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

        return c.json({
            isReadOnlyEnabled: true,
            isUnlocked,
            allowedOperations: readOnly.allowedOperations || [],
        });
    })
    // POST /api/auth/lock
    .post('/lock', async c => {
        return c.json({
            result: 'locked',
        });
    });

export default app;
